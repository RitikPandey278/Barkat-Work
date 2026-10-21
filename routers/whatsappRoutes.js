const express = require("express");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { getStatus, connect, pairingCode, setupAdmin, disconnect } = require("../controllers/whatsappController");

const router = express.Router();
router.post("/setup-admin", setupAdmin);
router.use(requireAdmin);
router.get("/status", getStatus);
router.post("/connect", connect);
router.post("/pairing-code", pairingCode);
router.post("/disconnect", disconnect);

module.exports = router;
