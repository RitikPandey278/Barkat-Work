const { sendWhatsAppMessage } = require("../services/whatsappService");
const {
    createOtp,
    createToken,
    findUser,
    normalizeMobile,
    verifyOtp
} = require("../services/authService");

const sendOtp = async (req, res) => {
    try {
        const { mobile, name, password, isLogin } = req.body;
        const normalizedMobile = normalizeMobile(mobile);
        if (!normalizedMobile) return res.status(400).json({ success: false, message: "Valid mobile number is required" });

        const existingUser = await findUser(normalizedMobile);
        const loginRequested = isLogin === true || isLogin === "true";
        if (loginRequested && !existingUser) {
            return res.status(404).json({ success: false, message: "User is not registered. Please register first." });
        }
        if (existingUser) {
            const otp = await createOtp({ mobile: normalizedMobile, purpose: "LOGIN" });
            await sendWhatsAppMessage(normalizedMobile, `Your BarkatWork login OTP is ${otp}. It expires in 5 minutes.`);
            return res.json({ success: true, message: "Login OTP sent successfully", isNewUser: false });
        }
        if (!name || !password || String(password).length < 6) {
            return res.status(400).json({ success: false, message: "Name and password of at least 6 characters are required for registration" });
        }
        const otp = await createOtp({ mobile: normalizedMobile, purpose: "REGISTER", name: String(name).trim(), password });
        await sendWhatsAppMessage(normalizedMobile, `Your BarkatWork registration OTP is ${otp}. It expires in 5 minutes.`);
        return res.json({ success: true, message: "Registration OTP sent successfully", isNewUser: true });
    } catch (error) {
        console.error("SEND OTP ERROR:", error);
        return res.status(503).json({ success: false, message: "OTP service unavailable", detail: error.message });
    }
};

const verifyOtpController = async (req, res) => {
    try {
        const normalizedMobile = normalizeMobile(req.body.mobile);
        const otp = String(req.body.otp || "").trim();
        if (!normalizedMobile || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: "Mobile number and 6-digit OTP are required" });
        }
        const result = await verifyOtp(normalizedMobile, otp);
        if (!result) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

        return res.json({
            success: true,
            message: result.purpose === "REGISTER" ? "Registration successful" : "Login successful",
            token: createToken(result.user),
            user: {
                id: result.user.id,
                name: result.user.name,
                mobile: result.user.mobile,
                role: result.user.role,
                isVerified: result.user.isVerified
            }
        });
    } catch (error) {
        console.error("VERIFY OTP ERROR:", error);
        return res.status(500).json({ success: false, message: "OTP verification failed", detail: error.message });
    }
};

module.exports = { sendOtp, verifyOtp: verifyOtpController };
