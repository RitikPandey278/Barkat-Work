
const axios = require("axios");

const ALLOWED_FIELDS = [
    "name",
    "workerType",
    "skill",
    "experience",
    "salary",
    "salaryPeriod",
    "salaryType",
    "phone",
    "location",
    "landmark",
    "pincode"
];

const REQUIRED_FIELDS = [
    "name",
    "workerType",
    "skill",
    "phone",
    "location",
    "pincode",
    "salaryType"
];

function cleanProfile(input = {}) {
    const result = {};

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return result;
    }

    for (const field of ALLOWED_FIELDS) {
        const value = input[field];

        if (typeof value === "string" || typeof value === "number") {
            result[field] = String(value).trim();
        }
    }

    // Normalize worker type.
    if (result.workerType) {
        const type = result.workerType.toLowerCase();

        if (type.includes("professional") || type.includes("office")) {
            result.workerType = "Professional";
        } else if (type.includes("local")) {
            result.workerType = "Local Worker";
        } else if (type === "other" || type.includes("अन्य")) {
            result.workerType = "Other";
        }
    }

    // Normalize salary type.
    if (result.salaryType) {
        const type = result.salaryType.toLowerCase();

        if (
            type.includes("negotiable") ||
            type.includes("बात") ||
            type.includes("तय करेंगे")
        ) {
            result.salaryType = "Negotiable";
        } else if (
            type.includes("fixed") ||
            type.includes("मांग") ||
            type.includes("निश्चित")
        ) {
            result.salaryType = "Fixed";
        }
    }

    // Normalize salary period.
    if (result.salaryPeriod) {
        const period = result.salaryPeriod.toLowerCase();

        if (period.includes("day") || period.includes("दिन")) {
            result.salaryPeriod = "day";
        } else if (period.includes("month") || period.includes("महीने")) {
            result.salaryPeriod = "month";
        } else if (period.includes("hour") || period.includes("घंटे")) {
            result.salaryPeriod = "hour";
        } else if (period.includes("project") || period.includes("प्रोजेक्ट")) {
            result.salaryPeriod = "project";
        }
    }

    // Do not keep invalid salary amounts.
    if (result.salary && !/^\d+(\.\d+)?$/.test(result.salary)) {
        delete result.salary;
    }

    // Indian mobile number: 10 digits starting from 6–9.
    if (result.phone) {
        const phone = result.phone.replace(/\D/g, "");

        if (/^[6-9]\d{9}$/.test(phone)) {
            result.phone = phone;
        }
    }

    // Indian PIN code: six digits, first digit cannot be zero.
    if (result.pincode) {
        const pin = result.pincode.replace(/\D/g, "");

        if (/^[1-9]\d{5}$/.test(pin)) {
            result.pincode = pin;
        }
    }

    return result;
}

function getMissingFields(profile) {
    const missing = REQUIRED_FIELDS.filter(field =>
        !String(profile[field] || "").trim()
    );

    // A fixed salary needs an amount and a period.
    if (profile.salaryType === "Fixed") {
        if (!profile.salary) missing.push("salary");
        if (!profile.salaryPeriod) missing.push("salaryPeriod");
    }

    // Experience and landmark are optional.
    return missing;
}

exports.processProfileConversation = async ({
    message,
    history = [],
    currentProfile = {}
}) => {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_KEY") {
        throw new Error("GEMINI_API_KEY is missing or invalid");
    }

    if (typeof message !== "string" || !message.trim()) {
        throw new Error("A non-empty message is required");
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const existingProfile = cleanProfile(currentProfile);

    // Accept only simple text history; cap its size.
    const safeHistory = Array.isArray(history)
        ? history.slice(-12).map(item => ({
            role: item?.role === "model" ? "model" : "user",
            parts: [{
                text: String(item?.text || "").slice(0, 2000)
            }]
        }))
        : [];

    const prompt = `
You are the friendly BarkatWork worker-profile assistant.
Reply in the user's language: Hindi, Hinglish, or English.

Your task is to help fill an Android worker profile form.
This is NOT a job-search task.

Extract these exact fields:
name, workerType, skill, experience, salary, salaryPeriod,
salaryType, phone, location, landmark, pincode.

FORM RULES:
- Accept any profession or skill. Never limit professions to a fixed list.
- workerType must be Local Worker, Professional, or Other.
- salaryType must be Fixed or Negotiable.
- salaryPeriod must be day, month, hour, or project.
- experience can be "Fresher", a number of years, or another
  clear description supplied by the user.
- Never invent personal details, salary, address, or phone.
- Do not infer a PIN code from a city.
- Preserve existing profile values unless the user corrects them.
- If the user provides many details in one message, extract all.
- Ask one short question at a time for missing important fields.
- Experience and landmark are optional.
- If salaryType is Negotiable, salary and salaryPeriod are optional.
- For Fixed salary, ask for amount and period if missing.
- A valid Indian phone number has 10 digits and starts with 6–9.
- A valid Indian PIN code has 6 digits and does not start with zero.
- Never say the profile was saved or submitted.
- The worker must review the Android form and submit it themselves.
- Return JSON only, without markdown.

Existing profile:
${JSON.stringify(existingProfile)}

Return this JSON shape:
{
  "reply": "Short message or next question for the worker",
  "profile": {
    "name": "",
    "workerType": "",
    "skill": "",
    "experience": "",
    "salary": "",
    "salaryPeriod": "",
    "salaryType": "",
    "phone": "",
    "location": "",
    "landmark": "",
    "pincode": ""
  }
}

In profile, include only values supported by the conversation or
existing profile. Do not invent values. Use an empty string for
unknown fields if returning the full shape.
`;

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await axios.post(
        url,
        {
            systemInstruction: {
                parts: [{ text: prompt }]
            },
            contents: [
                ...safeHistory,
                {
                    role: "user",
                    parts: [{ text: message.trim().slice(0, 4000) }]
                }
            ],
            generationConfig: {
                temperature: 0.2,
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

    const text = response.data?.candidates?.[0]?.content
        ?.parts?.map(part => part.text || "")
        .join("")
        .trim();

    if (!text) {
        throw new Error("Gemini returned an empty response");
    }

    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Gemini returned invalid JSON");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid profile assistant response");
    }

    const extracted = cleanProfile(parsed.profile);

    // Preserve known values when the model leaves a field blank.
    const updatedProfile = { ...existingProfile };

    for (const field of ALLOWED_FIELDS) {
        if (extracted[field]) {
            updatedProfile[field] = extracted[field];
        }
    }

    const missingFields = getMissingFields(updatedProfile);

    return {
        success: true,
        reply: String(
            parsed.reply || "आपकी जानकारी समझ गया। आगे की जानकारी बताइए।"
        ),
        profile: updatedProfile,
        missingFields,
        readyToReview: missingFields.length === 0
    };
};
