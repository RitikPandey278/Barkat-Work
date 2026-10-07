// controllers/aiController.js
const aiService = require('../services/aiService');

exports.smartSearch = async (req, res) => {
    try {
        const { userQuery, searchType } = req.body; // searchType = 'JOB' or 'WORKER'

        if (!userQuery) {
            return res.status(400).json({ success: false, message: "userQuery is required" });
        }

        const type = (searchType && searchType.toUpperCase() === 'WORKER') ? 'WORKER' : 'JOB';

        const result = await aiService.parseQueryAndSearch(userQuery, type);

        return res.status(200).json(result);

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Barkat AI Search Error: " + error.message
        });
    }
};