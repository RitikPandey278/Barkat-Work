const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    mobile: { type: String, required: true },
    otp: { type: String, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.model("Otp", otpSchema);
