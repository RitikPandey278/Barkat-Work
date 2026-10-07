// routers/aiRoutes.js
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// POST /api/ai/search
router.post('/search', aiController.smartSearch);

module.exports = router;