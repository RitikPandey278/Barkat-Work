const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const LoginToken = require("../models/LoginToken");

const TOKEN_TTL_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_REQUESTS = 5;

const loginRateLimitStore = new Map();

const getPublicApiBaseUrl = () => {
    const baseUrl = process.env.PUBLIC_API_BASE_URL || process.env.APP_BASE_URL;

    if (!baseUrl) {
        throw new Error("PUBLIC_API_BASE_URL is not configured");
    }

    return baseUrl.replace(/\/$/, "");
};

const buildPublicApiUrl = (path) => {
    return new URL(path, `${getPublicApiBaseUrl()}/`).toString();
};

const generateSecureToken = () => crypto.randomBytes(32).toString("hex");

const hashToken = (token) => {
    const secret = process.env.WHATSAPP_LOGIN_TOKEN_SECRET || process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("WHATSAPP_LOGIN_TOKEN_SECRET is not configured");
    }

    return crypto
        .createHmac("sha256", secret)
        .update(token)
        .digest("hex");
};

const issueJwt = (user) => {
    return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });
};

const isProfileComplete = (user) => {
    if (!user) {
        return false;
    }

    return Boolean(
        user.name &&
        user.gender &&
        user.dateOfBirth &&
        user.email &&
        user.city &&
        user.State &&
        user.pinCode &&
        user.profileImage
    );
};

const normalizeMobileForLookup = (mobile) => {
    if (!mobile || typeof mobile !== "string") {
        return null;
    }

    const digits = mobile.replace(/\D/g, "");

    if (!/^\d{10,15}$/.test(digits)) {
        return null;
    }

    if (/^0+$/.test(digits)) {
        return null;
    }

    return digits;
};

const shouldThrottleLogin = (mobile) => {
    const now = Date.now();
    const current = loginRateLimitStore.get(mobile);

    if (!current || current.resetAt <= now) {
        loginRateLimitStore.set(mobile, {
            count: 1,
            resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS
        });

        return false;
    }

    current.count += 1;

    if (current.count > LOGIN_RATE_LIMIT_MAX_REQUESTS) {
        return true;
    }

    return false;
};

const pruneExpiredTokens = async () => {
    await LoginToken.deleteMany({
        expiresAt: {
            $lte: new Date()
        }
    });
};

const ensureLoginTokenIndexes = async () => {
    try {
        await LoginToken.createCollection();
    } catch (error) {
        if (error.codeName !== "NamespaceExists" && error.code !== 48) {
            throw error;
        }
    }

    const existingIndexes = await LoginToken.collection.indexes();
    const legacyIndex = existingIndexes.find((index) => index.name === "token_1");

    if (legacyIndex) {
        await LoginToken.collection.dropIndex("token_1");
    }

    await LoginToken.syncIndexes();
};

const createLoginToken = async ({ userId, purpose }) => {
    await pruneExpiredTokens();
    await LoginToken.deleteMany({
        user: userId,
        purpose,
        consumedAt: null
    });

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);

    await LoginToken.create({
        user: userId,
        purpose,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
    });

    return rawToken;
};

const findUserByMobile = async (mobile) => {
    const normalizedMobile = normalizeMobileForLookup(mobile);

    if (!normalizedMobile) {
        return null;
    }

    const exactMatch = await User.findOne({ mobile: normalizedMobile });

    if (exactMatch) {
        return exactMatch;
    }

    if (normalizedMobile.length >= 10) {
        const suffix = normalizedMobile.slice(-10);

        return User.findOne({
            mobile: {
                $regex: `${suffix}$`
            }
        });
    }

    return null;
};

const ensureMinimalUser = async (mobile) => {
    const normalizedMobile = normalizeMobileForLookup(mobile);

    if (!normalizedMobile) {
        throw new Error("Invalid sender mobile number");
    }

    let user = await findUserByMobile(normalizedMobile);

    if (!user) {
        user = await User.create({
            mobile: normalizedMobile,
            isVerified: true
        });
    } else if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
    }

    return user;
};

const createWhatsAppLoginResponse = async (mobile) => {
    const normalizedMobile = normalizeMobileForLookup(mobile);

    if (!normalizedMobile) {
        return {
            success: false,
            message: "You are not registered. Please send REGISTER."
        };
    }

    if (shouldThrottleLogin(normalizedMobile)) {
        return {
            success: false,
            message: "Too many login requests. Please try again later."
        };
    }

    const user = await findUserByMobile(normalizedMobile);

    if (!user) {
        return {
            success: false,
            message: "You are not registered. Please send REGISTER."
        };
    }

    const token = await createLoginToken({
        userId: user._id,
        purpose: "LOGIN"
    });

    const loginLink = buildPublicApiUrl(`/api/auth/verify-login?token=${token}`);

    return {
        success: true,
        message: [
            "✅ P-MART Login Request Received",
            "",
            "Please tap the link below to continue:",
            loginLink,
            "",
            "This link expires in 5 minutes and can be used only once."
        ].join("\n")
    };
};

const createWhatsAppRegisterResponse = async (mobile) => {
    const existingUser = await findUserByMobile(mobile);

    if (existingUser) {
        return {
            success: false,
            message: "You already have an account. Send LOGIN."
        };
    }

    const user = await ensureMinimalUser(mobile);

    const token = await createLoginToken({
        userId: user._id,
        purpose: "REGISTER"
    });

    const registerLink = buildPublicApiUrl(`/api/auth/register?token=${token}`);

    return {
        success: true,
        message: [
            "✅ P-MART Registration Started",
            "",
            "Please tap the link below to complete your profile:",
            registerLink,
            "",
            "This link expires in 5 minutes and can be used only once."
        ].join("\n")
    };
};

const consumeWhatsAppAuthToken = async ({ rawToken, purpose }) => {
    if (!rawToken || typeof rawToken !== "string") {
        return null;
    }

    const tokenHash = hashToken(rawToken);

    return LoginToken.findOneAndUpdate(
        {
            tokenHash,
            purpose,
            consumedAt: null,
            expiresAt: {
                $gt: new Date()
            }
        },
        {
            $set: {
                consumedAt: new Date()
            }
        },
        {
            new: true
        }
    );
};

const finalizeWhatsAppTokenLogin = async ({ rawToken, purpose }) => {
    const tokenRecord = await consumeWhatsAppAuthToken({ rawToken, purpose });

    if (!tokenRecord) {
        return null;
    }

    const user = await User.findById(tokenRecord.user);

    if (!user) {
        return null;
    }

    return {
        token: issueJwt(user),
        user,
        needsProfileCompletion: !isProfileComplete(user)
    };
};

module.exports = {
    buildPublicApiUrl,
    createWhatsAppLoginResponse,
    createWhatsAppRegisterResponse,
    ensureMinimalUser,
    ensureLoginTokenIndexes,
    finalizeWhatsAppTokenLogin,
    findUserByMobile,
    isProfileComplete,
    issueJwt,
    normalizeMobileForLookup,
    pruneExpiredTokens
};