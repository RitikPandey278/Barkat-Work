// services/oneSignalService.js
const axios = require('axios');

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "YOUR_ONESIGNAL_APP_ID";
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY || "YOUR_ONESIGNAL_REST_API_KEY";

exports.sendPhoneNotification = async (jobData) => {
    try {
        const payload = {
            app_id: ONESIGNAL_APP_ID,
            
            // 🎯 Target Workers by Category & City
            filters: [
                { field: "tag", key: "category", relation: "=", value: jobData.category || "" },
                { field: "tag", key: "city", relation: "=", value: jobData.city || "" }
            ],
            
            headings: { en: "🔧 Nayi Job Vacancy Aayi Hai!" },
            contents: { en: `${jobData.title} - ${jobData.location} (Dihadi: ${jobData.budget || 'Negotiable'})` },
            
            data: { jobId: jobData.id }
        };

        const response = await axios.post("https://onesignal.com/api/v1/notifications", payload, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${ONESIGNAL_API_KEY}`
            }
        });

        console.log("OneSignal Push Sent:", response.data);

    } catch (error) {
        console.error("OneSignal Error:", error.response ? error.response.data : error.message);
    }
};