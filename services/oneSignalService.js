// services/oneSignalService.js
const axios = require('axios');
const {
    getOneSignalPlayerId,
    profileMatchesJob
} = require("./jobMatching");

exports.sendPhoneNotification = async (jobData) => {
    try {
        const appId = process.env.ONESIGNAL_APP_ID;
        const apiKey = process.env.ONESIGNAL_API_KEY;
        if (!appId || !apiKey) {
            console.error(
                "OneSignal is not configured. Set ONESIGNAL_APP_ID and ONESIGNAL_API_KEY."
            );
            return;
        }

        const { getFirestore } = require("../config/firebase");
        const db = getFirestore();
        const [usersSnapshot, seekersSnapshot] = await Promise.all([
            db.collection("Users").get(),
            db.collection("Seekers").get()
        ]);
        const playerIds = new Set();

        for (const snapshot of [usersSnapshot, seekersSnapshot]) {
            snapshot.forEach((doc) => {
                const profile = doc.data();
                if (
                    profile.pushNotifications === false ||
                    !profileMatchesJob(profile, jobData)
                ) {
                    return;
                }

                const playerId = getOneSignalPlayerId(profile);
                if (playerId) playerIds.add(String(playerId));
            });
        }

        const payload = {
            app_id: appId,
            headings: { en: "🔧 Nayi Job Vacancy Aayi Hai!" },
            contents: { en: `${jobData.title} - ${jobData.location} (Dihadi: ${jobData.budget || 'Negotiable'})` },
            data: { jobId: jobData.id }
        };

        if (playerIds.size > 0) {
            payload.include_player_ids = [...playerIds];
        } else {
            payload.filters = [
                { field: "tag", key: "category", relation: "=", value: jobData.category || "" },
                { operator: "AND" },
                { field: "tag", key: "city", relation: "=", value: jobData.city || jobData.location || "" }
            ];
        }

        const response = await axios.post("https://onesignal.com/api/v1/notifications", payload, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${apiKey}`
            }
        });

        console.log("OneSignal Push Sent:", response.data);

    } catch (error) {
        console.error("OneSignal Error:", error.response ? error.response.data : error.message);
    }
};