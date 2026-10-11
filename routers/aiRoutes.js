
const express = require("express");
const router = express.Router();

const aiController = require("../controllers/aiController");
const profileAssistantController =
    require("../controllers/profileAssistantController");
const jobPostAssistantController =
    require("../controllers/jobPostAssistantController");

// Existing AI Search
router.post("/search", aiController.smartSearch);

// Existing Worker Profile Assistant
router.post(
    "/profile-assistant",
    profileAssistantController.chat
);

// New Recruiter Job Post Assistant
router.post(
    "/job-post-assistant",
    jobPostAssistantController.chat
);

module.exports = router;
