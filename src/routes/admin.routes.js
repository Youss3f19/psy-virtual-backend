const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { runJob } = require('../jobs/weeklySummary.job');
const ApiResponse = require('../utils/apiResponse');

const router = express.Router();

// Trigger weekly summaries manually (protected)
router.post('/admin/run-weekly-summaries', protect, async (req, res, next) => {
  try {
    const result = await runJob();
    return res.json(ApiResponse.success({ generated: result.length }, 'Job exécuté'));
  } catch (err) { next(err); }
});

module.exports = router;
