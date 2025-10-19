const express = require('express');
const router = express.Router();

// GET /api/v1/msg91/templates
router.get('/templates', async (req, res) => {
  try {
    const msg91Service = require('../services/msg91Service');
    const templateResult = await msg91Service.getTemplates();

    res.json({
      success: true,
      data: templateResult
    });
  } catch (error) {
    console.error('Error fetching MSG91 templates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching templates',
      error: error.message
    });
  }
});

module.exports = router;
