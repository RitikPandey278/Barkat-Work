
const profileAssistantService = require("../services/profileAssistantService");

exports.chat = async (req, res) => {
    try {
        const {
            message,
            history = [],
            currentProfile = {}
        } = req.body || {};

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "message is required"
            });
        }

        if (!Array.isArray(history) || history.length > 30) {
            return res.status(400).json({
                success: false,
                message: "history must be an array with at most 30 messages"
            });
        }

        if (
            !currentProfile ||
            typeof currentProfile !== "object" ||
            Array.isArray(currentProfile)
        ) {
            return res.status(400).json({
                success: false,
                message: "currentProfile must be an object"
            });
        }

        const result =
            await profileAssistantService.processProfileConversation({
                message: message.trim(),
                history,
                currentProfile
            });

        return res.status(200).json(result);

    } catch (error) {
        console.error("Profile assistant error:", {
            message: error.message,
            status: error.response?.status,
            details: error.response?.data?.error?.message
        });

        return res.status(500).json({
            success: false,
            message: "Unable to process profile assistant request",
            error: error.response?.data?.error?.message ||
                error.message
        });
    }
};
