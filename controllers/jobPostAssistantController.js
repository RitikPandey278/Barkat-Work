
const jobPostAssistantService = require("../services/jobPostAssistantService");

exports.chat = async (req, res) => {
    try {
        const { message, history = [], currentJob = {} } = req.body || {};

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "message is required"
            });
        }

        if (!Array.isArray(history) || history.length > 50) {
            return res.status(400).json({
                success: false,
                message: "history must be an array with at most 50 items"
            });
        }

        if (
            !currentJob ||
            typeof currentJob !== "object" ||
            Array.isArray(currentJob)
        ) {
            return res.status(400).json({
                success: false,
                message: "currentJob must be an object"
            });
        }

        const result =
            await jobPostAssistantService.processJobPostConversation({
                message,
                history,
                currentJob
            });

        return res.status(200).json(result);
    } catch (error) {
        console.error(
            "BarkatWork Job Post Assistant Error:",
            error.response?.data || error.message
        );

        return res.status(500).json({
            success: false,
            message: "AI Job Post Assistant abhi response nahi de pa raha. Dobara try karein."
        });
    }
};
