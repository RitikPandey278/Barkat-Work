const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const pino = require("pino");
const { getMobile, profileMatchesJob } = require("./jobMatching");

const authDir = path.join(__dirname, "../auth_info_baileys");
let socket = null;
let reconnectTimer = null;
let qrTimer = null;
let qrDataUrl = null;
let qrExpiresAt = null;
let status = "DISCONNECTED";
let connectedNumber = null;
let manualDisconnect = false;
let connectionPromise = null;

const QR_TTL_MS = 5 * 60 * 1000;

const clearQr = () => {
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = null;
    qrDataUrl = null;
    qrExpiresAt = null;
};

const getStatus = () => ({
    status,
    connected: status === "CONNECTED",
    connectedNumber,
    qr: qrDataUrl,
    qrExpiresAt,
    qrAvailable: Boolean(qrDataUrl && qrExpiresAt > Date.now())
});

const normalizeRecipient = (mobile) => {
    const digits = String(mobile || "").replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    if (/^\d{11,15}$/.test(digits)) return digits;
    throw new Error("Invalid WhatsApp receiver number.");
};

const scheduleReconnect = () => {
    if (manualDisconnect || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWhatsApp();
    }, 5000);
};

const connectWhatsApp = async ({ resetSession = false } = {}) => {
    if (connectionPromise) return connectionPromise;

    connectionPromise = (async () => {
    try {
        manualDisconnect = false;
        clearQr();
        status = "CONNECTING";
        if (resetSession) {
            await disconnectWhatsApp({ clearAuth: true, reconnect: false });
        }
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();
        socket = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        socket.ev.on("creds.update", saveCreds);
        socket.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
            if (qr) {
                status = "QR_READY";
                qrDataUrl = await QRCode.toDataURL(qr);
                qrExpiresAt = Date.now() + QR_TTL_MS;
                if (qrTimer) clearTimeout(qrTimer);
                qrTimer = setTimeout(() => {
                    clearQr();
                    status = "DISCONNECTED";
                }, QR_TTL_MS);
            }
            if (connection === "open") {
                clearQr();
                status = "CONNECTED";
                connectedNumber = socket?.user?.id?.split(":")[0] || null;
                console.log("WhatsApp connected");
            }
            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                socket = null;
                connectedNumber = null;
                clearQr();
                console.log(`WhatsApp disconnected (${statusCode || "unknown"})`);
                if (manualDisconnect || statusCode === 440 || statusCode === DisconnectReason.loggedOut) {
                    status = "DISCONNECTED";
                    return;
                }
                status = "RECONNECTING";
                scheduleReconnect();
            }
        });
        return getStatus();
    } catch (error) {
        status = "ERROR";
        console.error("WhatsApp connection error:", error.message);
        scheduleReconnect();
        throw error;
    }
    })();

    try {
        return await connectionPromise;
    } finally {
        connectionPromise = null;
    }
};

const disconnectWhatsApp = async ({ clearAuth = true, reconnect = false } = {}) => {
    manualDisconnect = !reconnect;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearQr();
    if (socket) {
        try {
            if (clearAuth) await socket.logout();
            else socket.ws?.close();
        } catch (error) {
            console.error("WhatsApp disconnect error:", error.message);
        }
    }
    socket = null;
    connectedNumber = null;
    status = "DISCONNECTED";
    if (clearAuth) {
        await fs.promises.rm(authDir, { recursive: true, force: true });
    }
    if (reconnect) return connectWhatsApp({ resetSession: false });
    return getStatus();
};

const getWhatsAppStatus = () => {
    if (qrExpiresAt && qrExpiresAt <= Date.now()) clearQr();
    return getStatus();
};

const sendWhatsAppMessage = async (mobile, message) => {
    if (!socket || status !== "CONNECTED") throw new Error("WhatsApp is not connected.");
    const recipient = normalizeRecipient(mobile);
    const available = await socket.onWhatsApp(recipient);
    if (!available?.some((entry) => entry.exists)) {
        throw new Error("This number is not available on WhatsApp.");
    }
    await socket.sendMessage(`${recipient}@s.whatsapp.net`, { text: message });
};

const sendJobBroadcast = async (jobData) => {
    if (!socket) {
        console.log(
            "WhatsApp socket is not connected yet, skipping broadcast"
        );
        return;
    }

    try {
        const { getFirestore } = require("../config/firebase");
        const db = getFirestore();

        const [usersSnapshot, seekersSnapshot] = await Promise.all([
            db.collection("Users").get(),
            db.collection("Seekers").get()
        ]);
        const recipients = new Set();

        for (const snapshot of [usersSnapshot, seekersSnapshot]) {
            snapshot.forEach((doc) => {
                const profile = doc.data();
                if (
                    profile.whatsappNotifications === false ||
                    !profileMatchesJob(profile, jobData)
                ) {
                    return;
                }

                const mobile = getMobile(profile);
                if (!mobile) return;

                try {
                    recipients.add(normalizeRecipient(mobile));
                } catch (error) {
                    console.log(
                        "Skipping invalid WhatsApp number:",
                        mobile,
                        error.message
                    );
                }
            });
        }

        console.log(
            `Found ${recipients.size} matching WhatsApp recipients.`
        );

        const playStoreLink =
            `https://barkat-work.onrender.com/job/${jobData.id}`;

        const messageText =
`🔔 *BarkatWork: Nayi Job Vacancy!* 🔔

📌 *Kaam:* ${jobData.title} (${jobData.category || "General"})
📍 *Location:* ${jobData.location || "Not specified"}
💰 *Dihadi/Budget:* ${jobData.budget || "Negotiable"}

📲 *Full Details Dekhein & Apply Karein:*
${playStoreLink}`;

        for (const recipient of recipients) {
            try {
                const available = await socket.onWhatsApp(recipient);

                if (!available?.some((entry) => entry.exists)) {
                    console.log(
                        "Not available on WhatsApp:",
                        recipient
                    );
                    continue;
                }

                await socket.sendMessage(
                    `${recipient}@s.whatsapp.net`,
                    { text: messageText }
                );

                console.log(
                    "WhatsApp Job Broadcast Sent To:",
                    recipient
                );

            } catch (error) {
                console.log(
                    "WhatsApp Broadcast Failed:",
                    recipient,
                    error.message
                );
            }
        }

    } catch (error) {
        console.error(
            "WhatsApp Job Broadcast Failed:",
            error.message
        );
    }
};

module.exports = {
    connectWhatsApp,
    disconnectWhatsApp,
    getWhatsAppStatus,
    sendWhatsAppMessage,
    sendJobBroadcast
};