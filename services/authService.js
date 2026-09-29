const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getFirestore } = require("../config/firebase");

const OTP_TTL_MS = 5 * 60 * 1000;
const users = () => getFirestore().collection("Users");
const otpRequests = () => getFirestore().collection("otpRequests");

const normalizeMobile = (mobile) => {
    const digits = String(mobile || "").replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    return /^\d{11,15}$/.test(digits) && !/^0+$/.test(digits) ? digits : null;
};

const findUserRecord = async (mobile) => {
    const directRef = users().doc(mobile);
    const directSnapshot = await directRef.get();
    if (directSnapshot.exists) {
        return { ref: directRef, user: { id: directSnapshot.id, ...directSnapshot.data() } };
    }

    const querySnapshot = await users().where("mobile", "==", mobile).limit(1).get();
    if (querySnapshot.empty) return null;

    const document = querySnapshot.docs[0];
    return { ref: document.ref, user: { id: document.id, ...document.data() } };
};

const findUser = async (mobile) => {
    const record = await findUserRecord(mobile);
    return record?.user || null;
};

const createOtp = async ({ mobile, purpose, name, password }) => {
    const otp = crypto.randomInt(100000, 1000000).toString();
    await otpRequests().doc(mobile).set({
        mobile,
        purpose,
        name: name || "",
        passwordHash: password ? await bcrypt.hash(String(password), 12) : null,
        otpHash: crypto.createHash("sha256").update(otp).digest("hex"),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        createdAt: new Date()
    });
    return otp;
};

const verifyOtp = async (mobile, otp) => {
    const db = getFirestore();
    const otpRef = otpRequests().doc(mobile);
    const otpSnapshot = await otpRef.get();
    if (!otpSnapshot.exists) return null;

    const request = otpSnapshot.data();
    const expiresAt = request.expiresAt.toDate ? request.expiresAt.toDate() : new Date(request.expiresAt);
    const otpHash = crypto.createHash("sha256").update(String(otp)).digest("hex");
    if (expiresAt <= new Date() || otpHash !== request.otpHash) return null;

    const existingRecord = await findUserRecord(mobile);
    const userRef = existingRecord?.ref || users().doc(mobile);
    const userSnapshot = existingRecord ? { exists: true } : { exists: false };
    let user;
    if (request.purpose === "REGISTER") {
        if (userSnapshot.exists) {
            user = existingRecord.user;
        } else {
            user = {
                mobile,
                name: request.name,
                passwordHash: request.passwordHash,
                role: "USER",
                isVerified: true,
                createdAt: new Date()
            };
            await userRef.set(user);
            user = { id: mobile, ...user };
        }
    } else {
        if (!userSnapshot.exists) return null;
        user = existingRecord.user;
        await userRef.update({ isVerified: true, updatedAt: new Date() });
    }

    await otpRef.delete();
    return { user, purpose: request.purpose };
};

const createToken = (user) => jwt.sign(
    { id: user.id, mobile: user.mobile, role: user.role || "USER" },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
);

module.exports = { createOtp, createToken, findUser, normalizeMobile, verifyOtp };
