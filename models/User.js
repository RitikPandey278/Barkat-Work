const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: { type: String, default: "" },
    mobile: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, default: null, select: false },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["USER", "ADMIN"], default: "USER" },
    // email: { type: String, default: "" },
    // gender: { type: String, enum: ["Male", "Female", "Other"], default: null },
    // dateOfBirth: { type: Date, default: null },
    // city: { type: String, default: "" },
    // state: { type: String, default: "" },
    // pincode: { type: String, default: "" },
    // profileImage: { type: String, default: "" },
    // isVerified: { type: Boolean, default: false },
    // role: { type: String, enum: ["USER", "ADMIN"], default: "USER" }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
