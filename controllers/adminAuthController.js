const { sendWhatsAppMessage } = require("../services/whatsappService");
const {
    createOtp,
    createToken,
    findUser,
    normalizeMobile,
    verifyOtp
} = require("../services/authService");

const sendAdminOtp = async (req, res) => {
    try {
        const mobile = normalizeMobile(req.body.mobile);
        if (!mobile) {
            return res.status(400).json({ success: false, message: "Valid admin mobile number is required" });
        }

        const admin = await findUser(mobile);
        if (!admin || String(admin.role || "").toUpperCase() !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Admin account not found" });
        }

        const otp = await createOtp({ mobile, purpose: "ADMIN_LOGIN" });
        await sendWhatsAppMessage(
            mobile,
            `Your BarkatWork admin login OTP is ${otp}. It expires in 5 minutes.`
        );

        return res.json({ success: true, message: "Admin OTP sent successfully" });
    } catch (error) {
        console.error("SEND ADMIN OTP ERROR:", error);
        return res.status(503).json({ success: false, message: "Admin OTP service unavailable" });
    }
};

const verifyAdminOtp = async (req, res) => {
    try {
        const mobile = normalizeMobile(req.body.mobile);
        const otp = String(req.body.otp || "").trim();
        if (!mobile || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: "Mobile number and 6-digit OTP are required" });
        }

        const admin = await findUser(mobile);
        if (!admin || String(admin.role || "").toUpperCase() !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Admin account not found" });
        }

        const result = await verifyOtp(mobile, otp);
        if (!result || result.purpose !== "ADMIN_LOGIN") {
            return res.status(400).json({ success: false, message: "Invalid or expired admin OTP" });
        }

        return res.json({
            success: true,
            message: "Admin login successful",
            token: createToken({ ...result.user, role: "ADMIN" }),
            user: {
                id: result.user.id,
                mobile: result.user.mobile,
                name: result.user.name,
                role: "ADMIN"
            }
        });
    } catch (error) {
        console.error("VERIFY ADMIN OTP ERROR:", error);
        return res.status(500).json({ success: false, message: "Admin OTP verification failed" });
    }
};

module.exports = { sendAdminOtp, verifyAdminOtp };
