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

const getPincode = (values) =>
    values
        .map((value) => value.match(/\b\d{6}\b/))
        .find(Boolean)?.[0] || null;

const toCoordinate = (value) => {
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : null;
};

const coordinatesAreNearby = (profile, jobData) => {
    const profileLat = toCoordinate(profile.lat);
    const profileLon = toCoordinate(profile.lon);
    const jobLat = toCoordinate(jobData.lat);
    const jobLon = toCoordinate(jobData.lon);

    if (
        profileLat === null ||
        profileLon === null ||
        jobLat === null ||
        jobLon === null
    ) {
        return false;
    }

    const earthRadiusKm = 6371;
    const latitudeDelta = (jobLat - profileLat) * Math.PI / 180;
    const longitudeDelta = (jobLon - profileLon) * Math.PI / 180;
    const latitude1 = profileLat * Math.PI / 180;
    const latitude2 = jobLat * Math.PI / 180;
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(latitude1) *
            Math.cos(latitude2) *
            Math.sin(longitudeDelta / 2) ** 2;
    const distanceKm =
        2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return distanceKm <= 10;
};

const profileMatchesJob = (profile, jobData) => {
    const profileCategories = getProfileValues(profile, ["skill", "category", "skills"]);
    const jobCategories = getProfileValues(jobData, ["category", "title"]);
    const profileLocations = getProfileValues(profile, ["location", "city", "pincode"]);
    const jobLocations = getProfileValues(jobData, ["location", "city", "pincode"]);
    const profilePincode = getPincode(profileLocations);
    const jobPincode = getPincode(jobLocations);
    const locationMatches =
        (profilePincode && jobPincode && profilePincode === jobPincode) ||
        valuesMatch(profileLocations, jobLocations) ||
        coordinatesAreNearby(profile, jobData);

    return (
        profileCategories.length > 0 &&
        valuesMatch(profileCategories, jobCategories) &&
        locationMatches
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
