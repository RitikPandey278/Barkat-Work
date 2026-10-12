
const axios = require("axios");
const { getFirestore } = require("../config/firebase");

const RADIUS_KM = 20;

function isValidCoordinate(lat, lon) {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180
    );
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const toRad = value => value * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const safeA = Math.min(1, Math.max(0, a));

    return 6371 * 2 * Math.atan2(
        Math.sqrt(safeA),
        Math.sqrt(1 - safeA)
    );
}

function getSubscriptionId(profile) {
    return (
        profile.oneSignalId ||
        profile.oneSignalPlayerId ||
        profile.onesignalPlayerId ||
        profile.playerId ||
        null
    );
}

function getValidCoordinates(profile) {
    if (
        profile.lat === undefined ||
        profile.lat === null ||
        profile.lat === "" ||
        profile.lon === undefined ||
        profile.lon === null ||
        profile.lon === ""
    ) {
        return null;
    }

    const lat = Number(profile.lat);
    const lon = Number(profile.lon);

    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
}

exports.sendPhoneNotification = async (jobData) => {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_API_KEY;

    console.log("🔔 Job push started:", jobData.id);
    console.log("🔔 OneSignal App ID configured:", Boolean(appId));
    console.log("🔔 OneSignal API key configured:", Boolean(apiKey));

    if (!appId || !apiKey) {
        throw new Error("OneSignal credentials are missing");
    }

    const jobCoordinates = getValidCoordinates(jobData);

    if (!jobCoordinates) {
        console.error(
            "❌ Push skipped: job latitude/longitude missing or invalid",
            jobData.id
        );

        return {
            sent: false,
            reason: "missing_job_coordinates"
        };
    }

    const db = getFirestore();

    const [usersSnapshot, seekersSnapshot] = await Promise.all([
        db.collection("Users").get(),
        db.collection("Seekers").get()
    ]);

    const subscriptionIds = new Set();
    const processedProfiles = new Set();

    let nearbyWorkers = 0;
    let skippedWithoutCoordinates = 0;
    let skippedWithoutSubscription = 0;

    for (const snapshot of [usersSnapshot, seekersSnapshot]) {
        snapshot.forEach(doc => {
            const profile = doc.data();

            // If a user exists in both collections, don't count/send twice
            // when the same stable user ID is available.
            const stableId = profile.userId || doc.id;

            if (processedProfiles.has(stableId)) {
                return;
            }

            processedProfiles.add(stableId);

            // Respect an explicit notification opt-out.
            if (profile.pushNotifications === false) {
                return;
            }

            const coordinates = getValidCoordinates(profile);

            if (!coordinates) {
                skippedWithoutCoordinates++;
                return;
            }

            const distance = getDistanceKm(
                jobCoordinates.lat,
                jobCoordinates.lon,
                coordinates.lat,
                coordinates.lon
            );

            // No skill/category matching: distance is the only
            // worker-selection condition.
            if (distance > RADIUS_KM) {
                return;
            }

            nearbyWorkers++;

            const subscriptionId = getSubscriptionId(profile);

            if (!subscriptionId) {
                skippedWithoutSubscription++;
                return;
            }

            subscriptionIds.add(String(subscriptionId));
        });
    }

    console.log("📍 Nearby profiles:", nearbyWorkers);
    console.log("⚠️ Profiles without valid GPS:", skippedWithoutCoordinates);
    console.log("⚠️ Nearby profiles without push ID:", skippedWithoutSubscription);
    console.log("📱 Unique push subscription IDs:", subscriptionIds.size);

    if (subscriptionIds.size === 0) {
        console.log("ℹ️ No nearby workers with saved OneSignal IDs.");

        return {
            sent: false,
            reason: "no_nearby_subscriptions",
            nearbyWorkers
        };
    }

    const payload = {
        app_id: appId,
        include_player_ids: [...subscriptionIds],
        headings: {
            en: "🔔 Aapke area mein nayi job!"
        },
        contents: {
            en: `${jobData.title || "New Job"} - ${jobData.location || ""} | Budget: ${jobData.budget || "Negotiable"}`
        },
        data: {
            type: "NEW_JOB",
            jobId: String(jobData.id)
        }
    };

    try {
        const response = await axios.post(
            "https://onesignal.com/api/v1/notifications",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Basic ${apiKey}`
                },
                timeout: 20000
            }
        );

        console.log(
            "✅ OneSignal API response:",
            JSON.stringify(response.data)
        );

        return {
            sent: true,
            nearbyWorkers,
            subscriptionCount: subscriptionIds.size,
            oneSignalResponse: response.data
        };
    } catch (error) {
        console.error("❌ OneSignal HTTP status:", error.response?.status);
        console.error(
            "❌ OneSignal response:",
            JSON.stringify(error.response?.data || error.message)
        );

        throw error;
    }
};
