const crypto = require("crypto");
const User = require("../models/User");
const { normalizeMobileForLookup, issueJwt } = require("../services/whatsappAuthService");
const { sendWhatsAppMessage } = require("../services/progixWhatsAppService");
const generateOtp = require("../utils/generateOtp");
const Otp = require("../models/Otp");

const OTP_TTL_MS = 5 * 60 * 1000;

const sendOtp = async (req, res) => {
    try {
        const { name, mobile, password, isLogin } = req.body;

        if (!mobile) {
            return res.status(400).json({
                success: false,
                message: "Mobile number is required"
            });
        }

        const normalizedMobile = normalizeMobileForLookup(mobile);

        if (!normalizedMobile) {
            return res.status(400).json({
                success: false,
                message: "Invalid mobile number"
            });
        }

        const existingUser = await User.findOne({ mobile: normalizedMobile });

        if ((isLogin === true || isLogin === "true") && !existingUser) {
            return res.status(404).json({
                success: false,
                message: "Account is not registered. Please sign up first."
            });
        }

        if (existingUser) {
            const otp = generateOtp();

            await Otp.deleteMany({ mobile: normalizedMobile });
            await Otp.create({
                mobile: normalizedMobile,
                otp,
                purpose: "LOGIN",
                expiresAt: new Date(Date.now() + OTP_TTL_MS)
            });

            await sendWhatsAppMessage(
                normalizedMobile,
                `Your BarkatWork login OTP is ${otp}. It expires in 5 minutes.`
            );

            return res.status(200).json({
                success: true,
                message: "Login OTP sent successfully on WhatsApp",
                isNewUser: false
            });
        }

        if (!name || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, mobile number and password are required for registration"
            });
        }

        const trimmedName = String(name).trim();
        const trimmedPassword = String(password).trim();

        if (!trimmedName || trimmedPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Name is required and password must be at least 6 characters"
            });
        }

        const passwordSalt = crypto.randomBytes(16).toString("hex");
        const passwordHash = crypto.scryptSync(trimmedPassword, passwordSalt, 64).toString("hex");

        const otp = generateOtp();

        await Otp.deleteMany({ mobile: normalizedMobile });
        await Otp.create({
            mobile: normalizedMobile,
            otp,
            purpose: "REGISTER",
            name: trimmedName,
            passwordHash: `${passwordSalt}:${passwordHash}`,
            expiresAt: new Date(Date.now() + OTP_TTL_MS)
        });

        await sendWhatsAppMessage(
            normalizedMobile,
            `Your P-MART OTP is ${otp}. It expires in 5 minutes.`
        );

        return res.status(200).json({
            success: true,
            message: "Signup OTP sent successfully on WhatsApp",
            isNewUser: true
        });
    } catch (error) {
        console.error("SEND OTP ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "OTP service is temporarily unavailable",
            detail: error.message
        });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { mobile, otp } = req.body;

        if (!mobile || !otp) {
            return res.status(400).json({
                success: false,
                message: "Mobile number and OTP are required"
            });
        }

        const normalizedMobile = normalizeMobileForLookup(mobile);

        if (!normalizedMobile) {
            return res.status(400).json({
                success: false,
                message: "Invalid mobile number"
            });
        }

        const mobileSuffix = normalizedMobile.slice(-10);

        const otpRecord = await Otp.findOneAndDelete({
            mobile: {
                $regex: `${mobileSuffix}$`
            },
            otp: String(otp).trim(),
            expiresAt: {
                $gt: new Date()
            }
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        let user;

        if (otpRecord.purpose === "REGISTER") {
            user = await User.create({
                name: otpRecord.name,
                mobile: otpRecord.mobile,
                passwordHash: otpRecord.passwordHash,
                isVerified: true
            });
        } else {
            user = await User.findOne({ mobile: otpRecord.mobile });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            if (!user.isVerified) {
                user.isVerified = true;
                await user.save();
            }
        }

        const token = issueJwt(user);

        const safeUser = {
            id: user._id,
            name: user.name,
            mobile: user.mobile,
            isVerified: user.isVerified,
            role: user.role
        };

        return res.status(200).json({
            success: true,
            message: otpRecord.purpose === "REGISTER"
                ? "Registration successful"
                : "Login successful",
            token,
            user: safeUser,
            nextScreen: "HOME"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    sendOtp,
    verifyOtp
};