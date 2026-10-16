
const express = require("express");
const router = express.Router();

const {
    getTemplates,
    sendPush
} = require("../services/notificationService");

// IMPORTANT:
// Import your EXISTING admin-auth middleware here.
// Example only: const requireAdmin = require("../middleware/authMiddleware");
// Verify that it rejects non-admin users before enabling these routes.
const { requireAdmin } = require("../middleware/adminMiddleware");

router.get("/templates", requireAdmin, (req, res) => {
    res.json({
        success: true,
        templates: getTemplates()
    });
});

router.post("/send", requireAdmin, async (req, res) => {
    try {
        const { title, message, target, type } = req.body || {};

        if (
            typeof title !== "string" ||
            typeof message !== "string" ||
            !title.trim() ||
            !message.trim() ||
            title.length > 100 ||
            message.length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Title ya message invalid hai."
            });
        }

        if (!["all", "workers", "recruiters"].includes(target)) {
            return res.status(400).json({
                success: false,
                message: "Audience select karein."
            });
        }

        const result = await sendPush({
            title: title.trim(),
            message: message.trim(),
            target,
            type: typeof type === "string"
                ? type.slice(0, 40)
                : "ANNOUNCEMENT"
        });

        return res.json({
            success: true,
            message: "Notification request accepted.",
            ...result
        });
    } catch (error) {
        console.error("Admin notification send failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Notification send nahi ho saki."
        });
    }
});

module.exports = router;
