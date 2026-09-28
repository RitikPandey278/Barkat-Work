const {
    extractPlainTextMessage,
    extractReplyJid,
    extractSenderMobile,
    isIgnoredSystemJid
} = require("../utils/whatsappIdentity");

const {
    createWhatsAppLoginResponse,
    createWhatsAppRegisterResponse
} = require("./whatsappAuthService");

const createWhatsAppCommandHandler = ({ sendWhatsAppMessage }) => {

    if (typeof sendWhatsAppMessage !== "function") {
        throw new Error("sendWhatsAppMessage is required");
    }

    return async (message) => {

        const remoteJid = message?.key?.remoteJid;

        if (
            !remoteJid ||
            isIgnoredSystemJid(remoteJid) ||
            message?.key?.fromMe
        ) {
            return;
        }

        const text = extractPlainTextMessage(
            message?.message
        );

        if (!text) {
            return;
        }

        const command = text.trim().toUpperCase();

        if (
            command !== "LOGIN" &&
            command !== "REGISTER"
        ) {
            return;
        }

        const senderMobile = extractSenderMobile(
            message?.key
        );

        if (!senderMobile) {
            console.log("Unable to identify sender mobile.");
            return;
        }

        const replyJid = extractReplyJid(
            message?.key
        );

        if (!replyJid) {
            return;
        }

        console.log(
            `WhatsApp command: ${command} from ${senderMobile}`
        );

        let response;

        if (command === "LOGIN") {

            response =
                await createWhatsAppLoginResponse(
                    senderMobile
                );

        } else {

            response =
                await createWhatsAppRegisterResponse(
                    senderMobile
                );

        }

        if (!response?.message) {
            return;
        }

        await sendWhatsAppMessage(
            replyJid,
            response.message
        );
    };
};

module.exports = {
    createWhatsAppCommandHandler
};