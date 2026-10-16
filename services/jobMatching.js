const normalizeText = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

const textAliases = [
    ["राजमिस्त्री", "rajmistri"],
    ["राज मिस्त्री", "rajmistri"],
    ["mason", "rajmistri"],
    ["कारीगर", "worker"],
    ["मजदूर", "labour"],
    ["लेबर", "labour"],
    ["plumber", "plumber"],
    ["प्लंबर", "plumber"],
    ["इलेक्ट्रिशियन", "electrician"],
    ["इलेक्ट्रीशियन", "electrician"],
    ["carpenter", "carpenter"],
    ["बढ़ई", "carpenter"],
    ["पेंटर", "painter"],
    ["painter", "painter"],
    ["लखनऊ", "lucknow"],
    ["lucknow", "lucknow"],
    ["कल्याणपुर", "kalyanpur"],
    ["kalyanpur", "kalyanpur"],
    ["पश्चिम", "west"],
    ["west", "west"],
    ["गया", "gaya"],
    ["gaya", "gaya"]
];

const normalizeAliases = (value) => {
    let normalized = normalizeText(value);

    for (const [alias, canonical] of textAliases) {
        normalized = normalized.replaceAll(alias, canonical);
    }

    return normalized;
};

const getProfileValues = (profile, keys) =>
    keys
        .flatMap((key) => {
            const value = profile[key];
            return Array.isArray(value) ? value : [value];
        })
        .map(normalizeAliases)
        .filter(Boolean);

const valuesMatch = (profileValues, jobValues) =>
    profileValues.some((profileValue) =>
        jobValues.some((jobValue) =>
            profileValue.includes(jobValue) || jobValue.includes(profileValue)
        )
    );

const profileMatchesJob = (profile, jobData) => {
    const profileCategories = getProfileValues(profile, ["skill", "category", "skills"]);
    const jobCategories = getProfileValues(jobData, ["category", "title"]);

    return (
        profileCategories.length > 0 &&
        valuesMatch(profileCategories, jobCategories)
    );
};

const getMobile = (profile) => profile.mobile || profile.phone;

const getOneSignalPlayerId = (profile) =>
    profile.oneSignalPlayerId ||
    profile.onesignalPlayerId ||
    profile.playerId ||
    null;

module.exports = {
    getMobile,
    getOneSignalPlayerId,
    profileMatchesJob
};
