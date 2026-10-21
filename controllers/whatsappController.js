const whatsappService = require("../services/whatsappService");
const { createToken, findUser, normalizeMobile } = require("../services/authService");
const { getFirestore } = require("../config/firebase");

const getStatus = (req, res) => {
    return res.json({ success: true, data: whatsappService.getWhatsAppStatus() });
};

const connect = async (req, res) => {
    try {
        // Disconnect performs the explicit auth reset. Connect is safe to
        // call repeatedly while the mobile client waits for the QR.
        const data = await whatsappService.connectWhatsApp();
        return res.json({ success: true, data: whatsappService.getWhatsAppStatus() || data });
    } catch (error) {
        console.error("ADMIN WHATSAPP CONNECT ERROR:", error);
        return res.status(503).json({ success: false, message: "Unable to start WhatsApp connection" });
    }
};

const pairingCode = async (req, res) => {
    try {
        const code = await whatsappService.requestPairingCode(req.body?.phoneNumber);
        return res.json({
            success: true,
            data: { pairingCode: code, message: "Enter this code in WhatsApp > Linked devices > Link with phone number." }
        });
    } catch (error) {
        console.error("ADMIN WHATSAPP PAIRING CODE ERROR:", error);
        return res.status(503).json({ success: false, message: error.message });
    }
};

const setupAdmin = async (req, res) => {
    try {
        const setupKey = String(req.body?.setupKey || "");
        const expectedKey = String(process.env.ADMIN_SETUP_KEY || "");
        const mobile = normalizeMobile(req.body?.mobile);
        const name = String(req.body?.name || "").trim();

        if (!expectedKey || setupKey !== expectedKey) {
            return res.status(403).json({ success: false, message: "Invalid admin setup key" });
        }
        if (!mobile || !name) {
            return res.status(400).json({ success: false, message: "Admin name and valid mobile number are required" });
        }

        const adminSnapshot = await getFirestore()
            .collection("Users")
            .where("role", "==", "ADMIN")
            .limit(1)
            .get();
        if (!adminSnapshot.empty) {
            return res.status(409).json({ success: false, message: "An admin account already exists" });
        }

        const users = getFirestore().collection("Users");
        const directRef = users.doc(mobile);
        let userRef = directRef;
        let existingUser = null;
        const directSnapshot = await directRef.get();
        if (directSnapshot.exists) {
            existingUser = { id: directSnapshot.id, ...directSnapshot.data() };
        } else {
            const querySnapshot = await users.where("mobile", "==", mobile).limit(1).get();
            if (!querySnapshot.empty) {
                const document = querySnapshot.docs[0];
                userRef = document.ref;
                existingUser = { id: document.id, ...document.data() };
            }
        }

        const user = {
            ...(existingUser || {}),
            mobile,
            name: existingUser?.name || name,
            role: "ADMIN",
            isVerified: true,
            updatedAt: new Date()
        };
        await userRef.set(user, { merge: true });
        return res.json({
            success: true,
            message: existingUser ? "Existing user promoted to admin" : "Admin account created",
            token: createToken({ id: existingUser?.id || mobile, ...user })
        });
    } catch (error) {
        console.error("ADMIN SETUP ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to create admin account" });
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

module.exports = { getStatus, connect, pairingCode, setupAdmin, disconnect };
