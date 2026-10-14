const whatsappService = require("../services/whatsappService");

const getStatus = (req, res) => {
    return res.json({ success: true, data: whatsappService.getWhatsAppStatus() });
};

const connect = async (req, res) => {
    try {
        // Do not reset auth here. The mobile client may call this endpoint
        // again while polling for the QR; resetting would invalidate it.
        const data = await whatsappService.connectWhatsApp();
        return res.json({ success: true, data: whatsappService.getWhatsAppStatus() || data });
    } catch (error) {
        console.error("ADMIN WHATSAPP CONNECT ERROR:", error);
        return res.status(503).json({ success: false, message: "Unable to start WhatsApp connection" });
    }
};

const disconnect = async (req, res) => {
    try {
        const data = await whatsappService.disconnectWhatsApp({ clearAuth: true });
        return res.json({ success: true, data });
    } catch (error) {
        console.error("ADMIN WHATSAPP DISCONNECT ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to disconnect WhatsApp" });
    }
};

module.exports = { getStatus, connect, disconnect };
