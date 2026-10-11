
const axios = require("axios");

const ALLOWED_FIELDS = [
    "companyName",
    "category",
    "gender",
    "shift",
    "experience",
    "totalWorkers",
    "phone",
    "budgetType",
    "budget",
    "location",
    "landmark",
    "pincode",
    "description"
];

const REQUIRED_FIELDS = [
    "companyName",
    "category",
    "gender",
    "shift",
    "experience",
    "totalWorkers",
    "budgetType",
    "phone",
    "location",
    "pincode",
    "description"
];

function cleanJob(input = {}) {
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

    // Normalize gender.
    if (result.gender) {
        const value = result.gender.toLowerCase();

        if (
            value.includes("any") ||
            value.includes("कोई भी") ||
            value.includes("दोनों")
        ) {
            result.gender = "Any";
        } else if (
            value.includes("female") ||
            value.includes("महिला")
        ) {
            result.gender = "Female";
        } else if (
            value.includes("male") ||
            value.includes("पुरुष")
        ) {
            result.gender = "Male";
        }
    }

    // Normalize work shift.
    if (result.shift) {
        const value = result.shift.toLowerCase();

        if (
            value.includes("day") ||
            value.includes("दिन")
        ) {
            result.shift = "Day";
        } else if (
            value.includes("night") ||
            value.includes("रात")
        ) {
            result.shift = "Night";
        }
    }

    // Normalize budget type.
    if (result.budgetType) {
        const value = result.budgetType.toLowerCase();

        if (
            value.includes("negotiable") ||
            value.includes("बात") ||
            value.includes("तय करेंगे")
        ) {
            result.budgetType = "Negotiable";
        } else if (
            value.includes("fixed") ||
            value.includes("मांगा") ||
            value.includes("माँगा") ||
            value.includes("निश्चित")
        ) {
            result.budgetType = "Fixed";
        }
    }

    // Normalize worker count.
    if (result.totalWorkers) {
        const count = Number(result.totalWorkers);

        if (Number.isInteger(count) && count > 0 && count <= 10000) {
            result.totalWorkers = String(count);
        } else {
            delete result.totalWorkers;
        }
    }

    // Budget must be a non-negative numeric amount.
    if (result.budget) {
        const amount = result.budget.replace(/,/g, "");

        if (/^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0) {
            result.budget = amount;
        } else {
            delete result.budget;
        }
    }

    // Validate Indian mobile number.
    if (result.phone) {
        const phone = result.phone.replace(/\D/g, "");

        if (/^[6-9]\d{9}$/.test(phone)) {
            result.phone = phone;
        } else {
            delete result.phone;
        }
    }

    // Validate Indian PIN code.
    if (result.pincode) {
        const pin = result.pincode.replace(/\D/g, "");

        if (/^[1-9]\d{5}$/.test(pin)) {
            result.pincode = pin;
        } else {
            delete result.pincode;
        }
    }

    // A fixed budget requires an amount.
    if (result.budgetType === "Negotiable") {
        delete result.budget;
    }

    return result;
}

function getMissingFields(job) {
    const missing = REQUIRED_FIELDS.filter(field =>
        !String(job[field] || "").trim()
    );

    if (job.budgetType === "Fixed" && !job.budget) {
        missing.push("budget");
    }

    return missing;
}

exports.processJobPostConversation = async ({
    message,
    history = [],
    currentJob = {}
}) => {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_KEY") {
        throw new Error("GEMINI_API_KEY is missing or invalid");
    }

    if (typeof message !== "string" || !message.trim()) {
        throw new Error("A non-empty message is required");
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const existingJob = cleanJob(currentJob);

    const safeHistory = Array.isArray(history)
        ? history.slice(-12).map(item => ({
            role: item?.role === "model" ? "model" : "user",
            parts: [{
                text: String(item?.text || "").slice(0, 2000)
            }]
        }))
        : [];

    const prompt = `
You are the friendly BarkatWork recruiter job-posting assistant.
Reply in the user's language: Hindi, Hinglish, or English.

Your task is to help a recruiter fill a job-posting form.
Do not search for jobs and do not save or publish a job.

Extract these exact fields:
companyName, category, gender, shift, experience, totalWorkers,
phone, budgetType, budget, location, landmark, pincode, description.

RULES:
- Accept any legitimate occupation or job category. Never restrict
  the user to a fixed list of professions.
- Never invent company names, phone numbers, addresses, PIN codes,
  worker counts, salaries, or job details.
- Do not infer a PIN code from a city or area.
- Preserve existing values unless the user corrects them.
- Extract all details provided in one message.
- gender must be Male, Female, or Any when clearly specified.
- shift must be Day or Night when clearly specified.
- experience should preserve the user's meaning, such as Fresher
  or Experienced. Do not assume a value.
- budgetType must be Fixed or Negotiable.
- If the user says the budget will be discussed, use Negotiable.
- If the user gives a specific amount, use Fixed and extract budget.
- A Fixed budget requires a positive numeric budget amount.
- totalWorkers must be a positive whole number.
- A valid Indian phone has 10 digits starting with 6-9.
- A valid Indian PIN code has 6 digits and cannot start with zero.
- Ask one short question at a time for missing required information.
- Do not ask for landmark if it is not available; it is optional.
- Do not claim that the job has been saved or posted.
- The recruiter must review the form and press the existing Post button.
- Return JSON only, without markdown.

Existing job form values:
${JSON.stringify(existingJob)}

Return exactly this JSON shape:
{
  "reply": "A short helpful response or one follow-up question",
  "job": {
    "companyName": "",
    "category": "",
    "gender": "",
    "shift": "",
    "experience": "",
    "totalWorkers": "",
    "phone": "",
    "budgetType": "",
    "budget": "",
    "location": "",
    "landmark": "",
    "pincode": "",
    "description": ""
  }
}

Include only values supported by the conversation or existing form.
Use empty strings for unknown values. Do not invent details.
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
        throw new Error("Invalid job assistant response");
    }

    const extracted = cleanJob(parsed.job);
    const updatedJob = { ...existingJob };

    for (const field of ALLOWED_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(extracted, field)) {
            // Do not overwrite an existing field with a blank value.
            if (extracted[field]) {
                updatedJob[field] = extracted[field];
            }
        }
    }

    const missingFields = getMissingFields(updatedJob);

    return {
        success: true,
        reply: String(
            parsed.reply || "जानकारी समझ गया। कृपया बाकी विवरण बताइए।"
        ),
        job: updatedJob,
        missingFields,
        readyToReview: missingFields.length === 0
    };
};
