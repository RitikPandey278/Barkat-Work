const express = require("express");
const { sendAdminOtp, verifyAdminOtp } = require("../controllers/adminAuthController");

const router = express.Router();
router.post("/send-otp", sendAdminOtp);
router.post("/verify-otp", verifyAdminOtp);

module.exports = router;
