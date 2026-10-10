
const express = require("express");
const router = express.Router();

const aiController = require("../controllers/aiController");
const profileAssistantController =
    require("../controllers/profileAssistantController");

// Existing AI Search: Jobs and Workers
router.post("/search", aiController.smartSearch);

// New AI Worker Profile Assistant
router.post(
    "/profile-assistant",
    profileAssistantController.chat
);

module.exports = router;
