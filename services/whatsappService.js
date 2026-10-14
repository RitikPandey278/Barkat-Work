const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const pino = require("pino");
const { getMobile, profileMatchesJob } = require("./jobMatching");

const authDir = path.join(__dirname, "../auth_info_baileys");
const qrFilePath = path.join(__dirname, "../qr.png");
let socket = null;
let reconnectTimer = null;
let qrTimer = null;
let qrDataUrl = null;
let qrExpiresAt = null;
let status = "DISCONNECTED";
let connectedNumber = null;
let manualDisconnect = false;
let connectionPromise = null;
let socketGeneration = 0;
let qrGeneration = 0;
let qrWatchdogTimer = null;

const QR_TTL_MS = 5 * 60 * 1000;
const QR_WATCHDOG_MS = 15 * 1000;

const clearQr = () => {
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = null;
    qrDataUrl = null;
    qrExpiresAt = null;
};

const clearQrWatchdog = () => {
    if (qrWatchdogTimer) clearTimeout(qrWatchdogTimer);
    qrWatchdogTimer = null;
};

const removeQrFile = () => {
    fs.promises.rm(qrFilePath, { force: true }).catch((error) => {
        console.error("WhatsApp QR file cleanup error:", error.message);
    });
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
        connectWhatsApp().catch((error) => {
            console.error("WhatsApp reconnect error:", error.message);
        });
    }, 5000);
};

const restartAfterRequired = () => {
    if (manualDisconnect || reconnectTimer) return;
    status = "RECONNECTING";
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWhatsApp().catch((error) => {
            console.error("WhatsApp restart error:", error.message);
        });
    }, 250);
};

const connectWhatsApp = async ({ resetSession = false } = {}) => {
    // Repeated connect calls are used by the mobile client while it polls for
    // the QR. Never replace an active socket or invalidate its QR.
    if (
        socket &&
        (status === "CONNECTING" ||
            status === "QR_READY" ||
            status === "CONNECTED" ||
            status === "RECONNECTING")
    ) {
        return getStatus();
    }

    if (connectionPromise) return connectionPromise;

    connectionPromise = (async () => {
        try {
            manualDisconnect = false;
            clearQr();
            status = "CONNECTING";

            if (resetSession) {
                await disconnectWhatsApp({ clearAuth: true, reconnect: false });
            }

            await fs.promises.mkdir(authDir, { recursive: true });
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            await saveCreds();
            console.log("WhatsApp auth state initialized:", authDir);
            const { version } = await fetchLatestBaileysVersion();
            console.log("WhatsApp protocol version loaded:", version.join("."));
            const currentGeneration = ++socketGeneration;
            const currentSocket = makeWASocket({
                version,
                auth: state,
                browser: Browsers.ubuntu("Chrome"),
                // Keep Baileys history-sync payloads out of the terminal.
                // Connection errors are still logged by our handlers below.
                logger: pino({ level: "warn" }),
                markOnlineOnConnect: false,
                syncFullHistory: false,
                connectTimeoutMs: 30000
            });

            socket = currentSocket;
            console.log("WhatsApp socket created; waiting for QR/open event");
            clearQrWatchdog();
            qrWatchdogTimer = setTimeout(() => {
                if (
                    currentGeneration !== socketGeneration ||
                    socket !== currentSocket ||
                    status !== "CONNECTING"
                ) {
                    return;
                }

                console.error("WhatsApp QR timeout: restarting socket for a fresh QR");
                socket = null;
                socketGeneration += 1;
                try {
                    currentSocket.ws?.close();
                } catch (error) {
                    console.error("WhatsApp QR timeout socket close error:", error.message);
                }
                clearQr();
                status = "DISCONNECTED";
                // Keep auth state intact. Deleting it while Baileys is still
                // initializing can leave an empty directory and race with
                // creds/key writes.
                connectWhatsApp().catch((error) => {
                    console.error("WhatsApp QR timeout reconnect error:", error.message);
                });
            }, QR_WATCHDOG_MS);

            currentSocket.ev.on("creds.update", saveCreds);
            currentSocket.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
                // A logout/reconnect can emit late events. Never let an old
                // socket mutate the state of the current connection.
                if (currentGeneration !== socketGeneration || socket !== currentSocket) {
                    return;
                }

                if (qr) {
                    clearQrWatchdog();
                    console.log("WhatsApp QR event received");
                    const currentQrGeneration = ++qrGeneration;
                    try {
                        const generatedQr = await QRCode.toDataURL(qr);
                        if (
                            currentGeneration !== socketGeneration ||
                            currentQrGeneration !== qrGeneration ||
                            socket !== currentSocket
                        ) {
                            return;
                        }
                        qrDataUrl = generatedQr;
                        await QRCode.toFile(qrFilePath, qr, {
                            type: "png",
                            width: 512,
                            margin: 2
                        });
                        console.log("WhatsApp QR saved locally:", qrFilePath);
                    } catch (error) {
                        console.error("WhatsApp QR generation error:", error.message);
                        return;
                    }
                    status = "QR_READY";
                    qrExpiresAt = Date.now() + QR_TTL_MS;
                    if (qrTimer) clearTimeout(qrTimer);
                    qrTimer = setTimeout(() => {
                        if (currentGeneration !== socketGeneration) return;
                        clearQr();
                        removeQrFile();
                        status = "DISCONNECTED";
                    }, QR_TTL_MS);
                }

                if (connection === "open") {
                    clearQrWatchdog();
                    clearQr();
                    removeQrFile();
                    status = "CONNECTED";
                    connectedNumber = currentSocket.user?.id?.split(":")[0] || null;
                    console.log("WhatsApp connected");
                }

                if (connection === "close") {
                    clearQrWatchdog();
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    socket = null;
                    connectedNumber = null;
                    clearQr();
                    removeQrFile();
                    console.log(`WhatsApp disconnected (${statusCode || "unknown"})`);

                    console.error("WhatsApp disconnect details:", {
    statusCode,
    reason: lastDisconnect?.error?.message,
    errorName: lastDisconnect?.error?.name,
    status,
    time: new Date().toISOString()
});

                    if (
                        manualDisconnect ||
                        statusCode === DisconnectReason.connectionReplaced ||
                        statusCode === DisconnectReason.loggedOut
                    ) {
                        status = "DISCONNECTED";
                        if (statusCode === DisconnectReason.loggedOut) {
                            try {
                                fs.rmSync(authDir, { recursive: true, force: true });
                            } catch (error) {
                                console.error("WhatsApp invalid auth cleanup error:", error.message);
                            }
                        }
                        return;
                    }

                    if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                        // Baileys requires a brand-new socket after pairing.
                        // Keep auth files intact: they contain the pairing
                        // result that the replacement socket must use.
                        restartAfterRequired();
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
    clearQrWatchdog();
    clearQr();
    const oldSocket = socket;
    socket = null;
    socketGeneration += 1;
    if (oldSocket) {
        try {
            if (clearAuth) await oldSocket.logout();
            else oldSocket.ws?.close();
        } catch (error) {
            console.error("WhatsApp disconnect error:", error.message);
        }
    }
    connectedNumber = null;
    status = "DISCONNECTED";
    if (clearAuth) {
        // Remove every auth file synchronously before a fresh socket can be
        // created. This prevents a stale creds/key file from being reused.
        try {
            fs.rmSync(authDir, { recursive: true, force: true });
        } catch (error) {
            console.error("WhatsApp auth cleanup error:", error.message);
            throw error;
        }
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