
const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_API_KEY = process.env.ONESIGNAL_API_KEY;

const TEMPLATES = [
    {
        id: "app_update",
        title: "BarkatWork Update",
        message: "BarkatWork ke naye updates dekhein aur app explore karein.",
        target: "all",
        type: "ANNOUNCEMENT"
    },
    {
        id: "worker_motivation",
        title: "Apne agle mauke ki taraf badhein!",
        message: "BarkatWork par apne area ke kaam explore karein.",
        target: "workers",
        type: "PROMOTION"
    },
    {
        id: "recruiter_promotion",
        title: "Sahi workers dhoondhein",
        message: "BarkatWork par apni vacancy post karke workers tak pahunchein.",
        target: "recruiters",
        type: "PROMOTION"
    },
    {
        id: "important_notice",
        title: "BarkatWork Important Notice",
        message: "Nayi announcement padhne ke liye app kholen.",
        target: "all",
        type: "ANNOUNCEMENT"
    }
];

function getTemplates() {
    return TEMPLATES;
}

async function sendPush({ title, message, target, type }) {
    if (!APP_ID || !REST_API_KEY) {
        throw new Error("OneSignal server configuration missing");
    }

    const payload = {
        app_id: APP_ID,
        headings: { en: title },
        contents: { en: message },
        data: { type, source: "admin" }
    };

    if (target === "all") {
        payload.included_segments = ["Subscribed Users"];
    } else if (target === "workers" || target === "recruiters") {
        payload.filters = [{
            field: "tag",
            key: "role",
            relation: "=",
            value: target === "workers" ? "worker" : "recruiter"
        }];
    } else {
        throw new Error("Invalid notification audience");
    }

    const response = await fetch(
        "https://api.onesignal.com/notifications",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${REST_API_KEY}`
            },
            body: JSON.stringify(payload)
        }
    );

    const result = await response.json();

    if (!response.ok) {
        console.error("OneSignal request failed:", response.status, result);
        throw new Error("Notification provider rejected the request");
    }

    return {
        notificationId: result.id || null,
        recipients: result.recipients ?? null,
        errors: result.errors || []
    };
}

module.exports = { getTemplates, sendPush };
