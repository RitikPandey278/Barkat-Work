// routers/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// POST /api/jobs/post
router.post('/post', jobController.postJob);

module.exports = router;