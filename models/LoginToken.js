const mongoose = require("mongoose");

const loginTokenSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["LOGIN", "REGISTER"], required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    consumedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.model("LoginToken", loginTokenSchema);
