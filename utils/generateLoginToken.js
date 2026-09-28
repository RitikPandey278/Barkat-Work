const crypto = require("crypto");

const generateLoginToken = () => {
    return crypto.randomBytes(32).toString("hex");
};

module.exports = generateLoginToken;