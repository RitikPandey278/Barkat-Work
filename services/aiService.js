
const axios = require("axios");
const { getFirestore } = require("../config/firebase");

// Normalize text for case-insensitive Hindi/English matching.
function normalize(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .toLocaleLowerCase("en-IN")
        .replace(/[₹,]/g, " ")
        .replace(/[()[\]{}]/g, " ")
        .replace(/[.,!?;:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Extract a numeric amount from values such as "500 / day" or "₹20,000".
function getAmount(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const match = String(value ?? "")
        .replace(/,/g, "")
        .match(/\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
}

function uniqueStrings(values) {
    return [...new Set(
        (Array.isArray(values) ? values : [])
            .filter(value => typeof value === "string")
            .map(value => value.trim())
            .filter(Boolean)
    )];
}

// Search dynamically generated terms against actual stored text.
// No fixed profession list is used.
function textMatches(value, terms) {
    const text = normalize(value);

    if (!text || !terms.length) return false;

    return terms.some(term => {
        const query = normalize(term);

        if (!query) return false;

        // Full phrase match.
        if (text.includes(query)) return true;

        // Match meaningful words for phrases such as
        // "AC repairing technician".
        const words = query
            .split(" ")
            .filter(word => word.length >= 3);

        return words.length > 0 &&
            words.every(word => text.includes(word));
    });
}

function getRecordText(record, searchType) {
    if (searchType === "JOB") {
        return [
            record.title,
            record.category,
            record.description,
            record.city
        ].filter(Boolean).join(" ");
    }

    return [
        record.skill,
        record.category,
        record.name
    ].filter(Boolean).join(" ");
}

function getRecordLocation(record) {
    return [
        record.location,
        record.city,
        record.area,
        record.address
    ].filter(Boolean).join(" ");
}

function getRecordAmount(record, searchType) {
    if (searchType === "JOB") {
        return getAmount(record.budget);
    }

    return getAmount(
        record.expectedSalary ?? record.salary
    );
}

function isAvailableJob(record) {
    // Preserve existing records without a status field.
    if (!record.status) return true;

    return ["active", "open", "approved"].includes(
        normalize(record.status)
    );
}

async function extractSearchFilters(userQuery, searchType, apiKey) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const prompt = `
You are the query-understanding engine for BarkatWork,
an Indian jobs and worker-finding platform.

The user can speak or type in Hindi, English, or Hinglish.

The application has already selected this search mode:
${searchType}

IMPORTANT:
- Do not change the supplied search mode.
- Do not use a fixed list of occupations.
- Understand any profession, service, trade, skill, or job title,
  including new or uncommon professions.
- Infer the meaning of informal descriptions.
- For example, "ghar ki wiring karne wala" may refer to electrical work.
- For example, "AC theek karne wala" may refer to AC repair work.
- These are examples only, not a list of supported professions.
- Generate useful English, Hindi, or Hinglish search terms based on
  the actual query.
- Do not invent a location or salary.
- Extract the requested wage/budget as a number when explicitly stated.
- For JOB, budget means the job's offered wage/budget.
- For WORKER, budget means the recruiter's offered/desired amount
  only if the user explicitly states it.
- If no amount is stated, budget must be 0.
- Location should contain only the place name.
- If the user does not mention a location, location must be empty.
- Do not include the entire query in the location field.

Return valid JSON only, with these fields:
{
  "intent": "string",
  "category": "string",
  "searchTerms": ["string"],
  "location": "string",
  "locationVariants": ["string"],
  "budget": 0,
  "budgetPeriod": "day"
}

intent should briefly describe the user's purpose.
category should be a concise profession, skill, or job category.
searchTerms should contain a small set of relevant alternate terms.
budgetPeriod should be "day", "month", "hour", "project", or "unknown"
according to the user's query.

User query:
${JSON.stringify(userQuery)}
`;

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await axios.post(
        url,
        {
            contents: [
                {
                    parts: [{ text: prompt }]
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

    const rawText =
        response.data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

    if (!rawText) {
        throw new Error("Gemini returned an empty response");
    }

    let params;

    try {
        params = JSON.parse(rawText);
    } catch {
        throw new Error("Gemini returned invalid JSON");
    }

    params.intent = String(params.intent || "").trim();
    params.category = String(params.category || "").trim();
    params.location = String(params.location || "").trim();

    params.searchTerms = uniqueStrings([
        params.category,
        ...(Array.isArray(params.searchTerms)
            ? params.searchTerms
            : [])
    ]);

    params.locationVariants = uniqueStrings([
        params.location,
        ...(Array.isArray(params.locationVariants)
            ? params.locationVariants
            : [])
    ]);

    params.budget = getAmount(params.budget) || 0;
    params.budgetPeriod = String(
        params.budgetPeriod || "unknown"
    ).toLowerCase();

    return params;
}

exports.parseQueryAndSearch = async (userQuery, searchType) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey || apiKey === "YOUR_GEMINI_KEY") {
            throw new Error(
                "GEMINI_API_KEY is missing in environment variables"
            );
        }

        const type = String(searchType || "JOB").toUpperCase();

        if (!["JOB", "WORKER"].includes(type)) {
            throw new Error("searchType must be JOB or WORKER");
        }

        const db = getFirestore();

        // 1. Understand the query dynamically using Gemini.
        const params = await extractSearchFilters(
            String(userQuery).trim(),
            type,
            apiKey
        );

        // 2. Search only the collection appropriate to the app mode.
        const collectionName = type === "JOB" ? "Jobs" : "Seekers";
        const snapshot = await db.collection(collectionName).get();

        const records = snapshot.docs
            .map(doc => ({
                ...doc.data(),
                id: doc.id
            }))
            .filter(record =>
                type !== "JOB" || isAvailableJob(record)
            );

        const terms = params.searchTerms;
        const locations = params.locationVariants;

        // 3. Match the profession/skill dynamically.
        let candidates = records;

        if (terms.length) {
            candidates = candidates.filter(record =>
                textMatches(getRecordText(record, type), terms)
            );
        } else if (!locations.length) {
            // Avoid accidentally returning the entire database
            // when the query does not contain usable search filters.
            return {
                success: true,
                searchType: type,
                extractedParams: params,
                matchedTier: "none",
                count: 0,
                data: []
            };
        }

        // 4. Keep the location constraint when the user supplied one.
        // Do not silently show results from another city.
        if (locations.length) {
            candidates = candidates.filter(record =>
                textMatches(getRecordLocation(record), locations)
            );
        }

        // 5. Prefer exact budget matches when an amount was specified.
        // If none exist, retain relevant location/skill matches.
        // This avoids hiding jobs because stored budgets use strings.
        let results = candidates;
        let matchedTier = terms.length
            ? (locations.length ? "skill_location" : "skill_only")
            : "location_only";

        if (params.budget > 0) {
            const exactBudgetResults = candidates.filter(record => {
                const amount = getRecordAmount(record, type);
                return amount !== null && amount === params.budget;
            });

            if (exactBudgetResults.length > 0) {
                results = exactBudgetResults;
                matchedTier += "_exact_budget";
            } else if (candidates.length > 0) {
                // Keep relevant results; client can show that the
                // requested budget did not match exactly.
                matchedTier += "_budget_fallback";
            }
        }

        // 6. Return a stable response for Android.
        return {
            success: true,
            searchType: type,
            extractedParams: params,
            matchedTier,
            count: results.length,
            data: results
        };

    } catch (error) {
        console.error("BARKAT AI SEARCH ERROR:", {
            message: error.message,
            status: error.response?.status,
            details: error.response?.data?.error?.message
        });

        throw new Error(
            error.response?.data?.error?.message ||
            error.message ||
            "Barkat AI Search Error"
        );
    }
};
