// services/aiService.js
const axios = require("axios");
const { getFirestore } = require("../config/firebase");

exports.parseQueryAndSearch = async (userQuery, searchType) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey || apiKey === "YOUR_GEMINI_KEY") {
            throw new Error("GEMINI_API_KEY is missing or invalid in .env file");
        }

        const prompt = `
You are Barkat AI assistant for Indian Job Portal 'BarkatWork'.

Extract search filters from the user query into strict JSON format ONLY.

JSON Fields:
- category (string: e.g. Electrician, Plumber, Painter, Mason, Carpenter, Driver, etc.)
- location (string: e.g. Gaya, Patna, Lucknow, Delhi, etc.)
- budget (number: daily rate/wage if mentioned, else 0)

User Query: "${userQuery}"

Return JSON ONLY:
{"category":"...", "location":"...", "budget":0}
`;

        // Use a model available to your project.
        const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

        // IMPORTANT: Correct Google Gemini API URL
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        console.log("Gemini Model:", model);
        console.log("Gemini URL:", url.replace(apiKey, "HIDDEN"));

        const aiResponse = await axios.post(
            url,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0,
                    responseMimeType: "application/json"
                }
            },
            {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        const text =
            aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        console.log("Gemini Raw Response:", text);

        let params = {};

        try {
            params = JSON.parse(text);
        } catch (parseError) {
            console.error("Gemini JSON Parse Error:", parseError);
            throw new Error("Gemini returned invalid JSON");
        }

        console.log("Barkat AI Extracted Filters:", params);

        // -----------------------------------
        // Firestore Search
        // -----------------------------------

        const db = getFirestore();

        const collectionName =
            searchType === "JOB" ? "Jobs" : "Seekers";

        const snapshot = await db.collection(collectionName).get();

        const results = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id;

            let isMatch = true;

            // Category / Skill matching
            if (params.category) {
                const category = String(data.category || "").toLowerCase();
                const skill = String(data.skill || "").toLowerCase();
                const wantedCategory = String(params.category).toLowerCase();

                if (
                    !category.includes(wantedCategory) &&
                    !skill.includes(wantedCategory)
                ) {
                    isMatch = false;
                }
            }

            // Location matching
            if (params.location && data.location) {
                const dataLocation = String(data.location).toLowerCase();
                const wantedLocation = String(params.location).toLowerCase();

                if (!dataLocation.includes(wantedLocation)) {
                    isMatch = false;
                }
            }

            if (isMatch) {
                results.push(data);
            }
        });

        return {
            success: true,
            extractedParams: params,
            count: results.length,
            data: results
        };

    } catch (error) {
        console.error("========== BARKAT AI ERROR ==========");

        console.error("Message:", error.message);
        console.error("Status:", error.response?.status);
        console.error(
            "Gemini Error:",
            JSON.stringify(error.response?.data, null, 2)
        );

        console.error("====================================");

        throw new Error(
            error.response?.data?.error?.message ||
            error.message ||
            "Barkat AI Search Error"
        );
    }
};