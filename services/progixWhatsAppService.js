const { getFirestore } = require("../config/firebase");

const PROGIX_API_URL = "https://progixemail.com/api/send";
const PROGIX_HOST = "Progix.org";
const SENDER_MOBILE = process.env.WHATSAPP_SENDER || "917050266383";

const toCountryCodeMobile = (mobile) => {
    const digits = String(mobile || "").replace(/\D/g, "");

    if (digits.length === 10) {
        return `91${digits}`;
    }

    if (digits.length >= 11 && digits.length <= 15) {
        return digits;
    }

    throw new Error("Invalid receiver mobile number.");
};

const getApiToken = async () => {
    if (process.env.WHATSAPP_API_TOKEN) {
        return process.env.WHATSAPP_API_TOKEN.trim();
    }

    const snapshot = await getFirestore()
        .collection("AppConfig")
        .doc("WhatsAppAPI")
        .get();

    const apiToken = snapshot.data()?.apiToken;

    if (!apiToken || typeof apiToken !== "string") {
        throw new Error("WhatsApp API token is missing in Firestore at AppConfig/WhatsAppAPI.apiToken.");
    }

    return apiToken.trim();
};

const sendWhatsAppMessage = async (receiver, message) => {
    if (!message || typeof message !== "string") {
        throw new Error("Message is required.");
    }

    const apiToken = await getApiToken();
    const url = new URL(PROGIX_API_URL);
    url.searchParams.set("sender", SENDER_MOBILE);
    url.searchParams.set("receiver", toCountryCodeMobile(receiver));
    url.searchParams.set("message", message);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Host: PROGIX_HOST,
            Authorization: `Bearer ${apiToken}`
        }
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(`WhatsApp API returned invalid JSON (HTTP ${response.status}).`);
    }

    if (!response.ok || result.ok !== true) {
        throw new Error(result.message || `WhatsApp API request failed (HTTP ${response.status}).`);
    }

    return result;
};

module.exports = { sendWhatsAppMessage };
