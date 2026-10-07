// controllers/jobController.js
 const { getFirestore } = require("../config/firebase");
const whatsappService = require('../services/whatsappService');
const oneSignalService = require('../services/oneSignalService');

exports.postJob = async (req, res) => {
    try {
        const { title, category, location, city, budget, description, phone } = req.body;

        if (!title || !location) {
            return res.status(400).json({ success: false, message: "Title and location are required" });
        }

         const db = getFirestore();

        // 1. Create Job Document in Firestore 'Jobs' Collection
        const jobRef = db.collection('Jobs').doc();
        const jobId = jobRef.id;

        const newJob = {
            id: jobId,
            title: title,
            category: category || "General",
            location: location,
            city: city || location,
            budget: budget || "Negotiable",
            description: description || "",
            phone: phone || "",
            status: "active",
            createdAt: new Date(),
            timestamp: Date.now()
        };

        await jobRef.set(newJob);

        // 2. 🔥 Async Background Triggers (Does NOT block HTTP response!)
        // A) Baileys WhatsApp Broadcast
        whatsappService.sendJobBroadcast(newJob).catch(err => console.error("WhatsApp Broadcast Error:", err));

        // B) OneSignal Phone Push Notification
        oneSignalService.sendPhoneNotification(newJob).catch(err => console.error("OneSignal Push Error:", err));

        // 3. Return Instant Success Response
        return res.status(200).json({
            success: true,
            message: "Job posted successfully, WhatsApp broadcast & Phone push notification triggered!",
            jobId: jobId,
            data: newJob
        });

    } catch (error) {
        console.error("Post Job Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error: " + error.message
        });
    }
};