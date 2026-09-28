const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const QRCode = require("qrcode");
const path = require("path");
const P = require("pino");
const { createWhatsAppCommandHandler } = require("./whatsappCommandService");
const { isDirectChatJid, normalizeMobileNumber } = require("../utils/whatsappIdentity");


let sock = null;

// ================= CONNECT WHATSAPP =================

async function connectWhatsApp() {

    try {

        const { state, saveCreds } =
            await useMultiFileAuthState("./auth_info_baileys");

        const { version } =
            await fetchLatestBaileysVersion();

        // Close old socket
        if (sock) {
            try {
                sock.end();
            } catch (e) {}
        }

        sock = makeWASocket({
            version,
            auth: state,
            logger: P({ level: "silent" }),
            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        sock.ev.on("creds.update", saveCreds);

        const handleIncomingMessage = createWhatsAppCommandHandler({
            sendWhatsAppMessage
        });

        sock.ev.on("messages.upsert", async ({ messages }) => {
        try{
            const msg = messages[0];
            if(!msg.message) return;

            await handleIncomingMessage(msg);
    }

        catch(err){
            console.log(err);
        }
    });

    sock.ev.on("connection.update", async ({
            connection,
            qr,
            lastDisconnect
        }) => {

            if (qr) {

                const qrPath = path.join(__dirname, "../qr.png");

                try {

                    await QRCode.toFile(qrPath, qr);

                    console.log("\n==============================");
                    console.log("✅ QR Saved");
                    console.log("Scan : backend/qr.png");
                    console.log("==============================\n");

                } catch (err) {
                    console.log(err);
                }

            }

            if (connection === "connecting") {
                console.log("🟡 Connecting...");
            }

            if (connection === "open") {
                console.log("🟢 WhatsApp Connected Successfully");
            }

            if (connection === "close") {

                console.log("🔴 WhatsApp Disconnected");

                const statusCode =
                    lastDisconnect?.error?.output?.statusCode;

                console.log("Status Code :", statusCode);

                console.log("Reason :", lastDisconnect?.error);

                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {

                    console.log("♻ Reconnecting after 5 seconds...");

                    setTimeout(() => {
                        connectWhatsApp();
                    }, 5000);

                } else {

                    console.log("❌ Logged Out");
                    console.log("Please Scan QR Again");

                }

            }

        });

    } catch (error) {

        console.log("WhatsApp Connection Error");
        console.log(error);

        setTimeout(() => {
            connectWhatsApp();
        }, 5000);

    }


}

// ================= SEND MESSAGE =================

async function sendWhatsAppMessage(number, message) {

    if (!sock) {
        throw new Error("WhatsApp is not connected.");
    }

    if (!message || typeof message !== "string") {
        throw new Error("Message is required.");
    }

    const target = typeof number === "string" ? number.trim() : "";

    if (!target) {
        throw new Error("Invalid WhatsApp target.");
    }

    if (target.includes("@")) {
        if (!isDirectChatJid(target)) {
            throw new Error("Invalid WhatsApp target.");
        }

        await sock.sendMessage(target, { text: message });

        return;
    }

    const mobile = normalizeMobileNumber(target);

    if (!mobile) {
        throw new Error("Invalid mobile number.");
    }

    const result = await sock.onWhatsApp(mobile);

    if (!result || result.length === 0 || !result[0].exists) {
        throw new Error("This number is not available on WhatsApp.");
    }

    await sock.sendMessage(result[0].jid, { text: message });

    return;

}

// ================= GET SOCKET =================

function getSocket() {
    return sock;
}

module.exports = {
    connectWhatsApp,
    sendWhatsAppMessage,
    getSocket
};