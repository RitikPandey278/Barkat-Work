const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    mobile: { type: String, required: true },
    otp: { type: String, required: true },
    purpose: { type: String, enum: ["LOGIN", "REGISTER"], required: true },
    name: { type: String, default: "" },
    passwordHash: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.model("Otp", otpSchema);
