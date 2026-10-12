
const { getFirestore } = require("../config/firebase");
const whatsappService = require("../services/whatsappService");
const oneSignalService = require("../services/oneSignalService");

function parseCoordinate(value, min, max) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < min || number > max) {
        return null;
    }

    return number;
}

exports.postJob = async (req, res) => {
    try {
        const {
            title,
            category,
            location,
            city,
            budget,
            description,
            phone,
            lat,
            lon
        } = req.body || {};

        if (!title || !location) {
            return res.status(400).json({
                success: false,
                message: "Title and location are required"
            });
        }

        const jobLat = parseCoordinate(lat, -90, 90);
        const jobLon = parseCoordinate(lon, -180, 180);

        // Require both coordinates together, or neither.
        if ((jobLat === null) !== (jobLon === null)) {
            return res.status(400).json({
                success: false,
                message: "Both valid lat and lon are required together"
            });
        }

        const db = getFirestore();

        // 1. Save the job in Firestore.
        const jobRef = db.collection("Jobs").doc();
        const jobId = jobRef.id;

        const newJob = {
            id: jobId,
            title: String(title).trim(),
            category: category || "General",
            location: String(location).trim(),
            city: city || location,
            budget: budget || "Negotiable",
            description: description || "",
            phone: phone || "",
            lat: jobLat,
            lon: jobLon,
            status: "active",
            createdAt: new Date(),
            timestamp: Date.now()
        };

        await jobRef.set(newJob);

        // 2A. WhatsApp broadcast — KEEP EXISTING FUNCTION UNCHANGED.
        whatsappService.sendJobBroadcast(newJob).catch(err => {
            console.error("WhatsApp Broadcast Error:", err);
        });

        // 2B. Independent app push notification.
        // Does not block the job-post response.
        oneSignalService.sendPhoneNotification(newJob).catch(err => {
            console.error("OneSignal Push Error:", err);
        });

        // 3. Return job-post success.
        return res.status(200).json({
            success: true,
            message: "Job posted successfully. WhatsApp and app push processing triggered.",
            jobId,
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
