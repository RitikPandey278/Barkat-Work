const normalizeText = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

const getProfileValues = (profile, keys) =>
    keys
        .map((key) => normalizeText(profile[key]))
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
    const profileLocations = getProfileValues(profile, ["location", "city"]);
    const jobLocations = getProfileValues(jobData, ["location", "city"]);

    return (
        profileCategories.length > 0 &&
        profileLocations.length > 0 &&
        valuesMatch(profileCategories, jobCategories) &&
        valuesMatch(profileLocations, jobLocations)
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
