const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const path = require("path");
const pino = require("pino");

const authDir = path.join(__dirname, "../auth_info_baileys");
const qrPath = path.join(__dirname, "../qr.png");
let socket = null;
let reconnectTimer = null;

const normalizeRecipient = (mobile) => {
    const digits = String(mobile || "").replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    if (/^\d{11,15}$/.test(digits)) return digits;
    throw new Error("Invalid WhatsApp receiver number.");
};

const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWhatsApp();
    }, 5000);
};

const connectWhatsApp = async () => {
    try {
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
                await QRCode.toFile(qrPath, qr);
                console.log(`Scan QR: ${qrPath}`);
            }
            if (connection === "open") console.log("WhatsApp connected");
            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                socket = null;
                console.log(`WhatsApp disconnected (${statusCode || "unknown"})`);
                if (statusCode === 440 || statusCode === DisconnectReason.loggedOut) {
                    console.log("Unlink the old WhatsApp device and pair again.");
                    return;
                }
                scheduleReconnect();
            }
        });
    } catch (error) {
        console.error("WhatsApp connection error:", error.message);
        scheduleReconnect();
    }
};

const sendWhatsAppMessage = async (mobile, message) => {
    if (!socket) throw new Error("WhatsApp is not connected. Scan backend/qr.png first.");
    const recipient = normalizeRecipient(mobile);
    const available = await socket.onWhatsApp(recipient);
    if (!available?.some((entry) => entry.exists)) {
        throw new Error("This number is not available on WhatsApp.");
    }
    await socket.sendMessage(`${recipient}@s.whatsapp.net`, { text: message });
};

module.exports = { connectWhatsApp, sendWhatsAppMessage };
