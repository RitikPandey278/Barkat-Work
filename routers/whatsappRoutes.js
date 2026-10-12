const express = require("express");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { getStatus, connect, disconnect } = require("../controllers/whatsappController");

const router = express.Router();
router.use(requireAdmin);
router.get("/status", getStatus);
router.post("/connect", connect);
router.post("/disconnect", disconnect);

module.exports = router;
