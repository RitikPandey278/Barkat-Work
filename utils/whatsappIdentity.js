const DIRECT_JID_SUFFIXES = ["@s.whatsapp.net", "@lid"];

const normalizeMobileNumber = (value) => {
    if (!value || typeof value !== "string") {
        return null;
    }

    const digits = value.replace(/\D/g, "");

    if (!/^\d{10,15}$/.test(digits)) {
        return null;
    }

    return digits;
};

const isDirectChatJid = (jid) => {
    if (!jid || typeof jid !== "string") {
        return false;
    }

    return DIRECT_JID_SUFFIXES.some((suffix) => jid.endsWith(suffix));
};

const isIgnoredSystemJid = (jid) => {
    if (!jid || typeof jid !== "string") {
        return true;
    }

    return (
        jid === "status@broadcast" ||
        jid.endsWith("@g.us") ||
        jid.endsWith("@newsletter") ||
        jid.endsWith("@broadcast")
    );
};

const extractReplyJid = (key) => {
    const jid = key?.remoteJidAlt || key?.remoteJid;

    if (!jid || typeof jid !== "string") {
        return null;
    }

    return jid;
};

const extractSenderMobile = (key) => {
    const altJid = key?.remoteJidAlt || key?.remoteJid;

    if (
        altJid &&
        typeof altJid === "string" &&
        (altJid.endsWith("@s.whatsapp.net") || altJid.endsWith("@lid"))
    ) {
        const normalizedJid = altJid.replace(/@(s\.whatsapp\.net|lid)$/, "");

        return normalizeMobileNumber(
            normalizedJid
        );
    }

    return null;
};

const extractPlainTextMessage = (message) => {
    if (!message || typeof message !== "object") {
        return null;
    }

    const text = message.conversation || message?.extendedTextMessage?.text;

    if (!text || typeof text !== "string") {
        return null;
    }

    const contextInfo = message?.extendedTextMessage?.contextInfo;

    if (contextInfo?.isForwarded || (contextInfo?.forwardingScore || 0) > 0) {
        return null;
    }

    return text.trim();
};

module.exports = {
    extractPlainTextMessage,
    extractReplyJid,
    extractSenderMobile,
    isDirectChatJid,
    isIgnoredSystemJid,
    normalizeMobileNumber
};