
const express = require("express");
const router = express.Router();

const {
    getTemplates,
    sendPush
} = require("../services/notificationService");

const { requireAdmin } = require("../middleware/adminMiddleware");

// GET /api/admin/notifications/templates
// Admin notification templates return karta hai.
router.get("/templates", requireAdmin, (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            templates: getTemplates()
        });
    } catch (error) {
        console.error(
            "Get notification templates failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Notification templates load nahi ho sake."
        });
    }
});

// POST /api/admin/notifications/send
// Admin se push notification send karne ke liye.
router.post("/send", requireAdmin, async (req, res) => {
    try {
        const { title, message, target, type } = req.body || {};

        // Title validation
        if (
            typeof title !== "string" ||
            !title.trim() ||
            title.trim().length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Title required hai aur maximum 100 characters ka ho sakta hai."
            });
        }

        // Message validation
        if (
            typeof message !== "string" ||
            !message.trim() ||
            message.trim().length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Message required hai aur maximum 1000 characters ka ho sakta hai."
            });
        }

        // Audience validation
        const allowedTargets = ["all", "workers", "recruiters"];

        if (!allowedTargets.includes(target)) {
            return res.status(400).json({
                success: false,
                message: "Valid audience select karein: all, workers, recruiters."
            });
        }

        // Type validation/default
        const notificationType =
            typeof type === "string" && type.trim()
                ? type.trim().slice(0, 40)
                : "ANNOUNCEMENT";

        // OneSignal request
        const result = await sendPush({
            title: title.trim(),
            message: message.trim(),
            target,
            type: notificationType
        });

        // HTTP 200 ke bawajood notification create na hui ho
        if (!result || !result.notificationId) {
            console.error(
                "OneSignal did not create notification:",
                result
            );

            return res.status(422).json({
                success: false,
                message: "OneSignal ne notification create nahi ki. Audience aur subscriptions check karein.",
                notificationId: result?.notificationId ?? null,
                recipients: result?.recipients ?? 0,
                errors: result?.errors || [
                    "Notification ID missing from OneSignal response."
                ]
            });
        }

        // Notification successfully created by OneSignal
        return res.status(200).json({
            success: true,
            message: "Notification successfully create ho gayi.",
            notificationId: result.notificationId,
            recipients: result.recipients ?? null,
            errors: result.errors || []
        });

    } catch (error) {
        console.error(
            "Admin notification send failed:",
            error.message
        );

        return res.status(502).json({
            success: false,
            message: "Notification provider request fail ho gayi. Server logs check karein."
        });
    }
});

module.exports = router;
