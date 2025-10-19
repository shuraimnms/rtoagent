const Agent = require('../models/Agent');

/**
 * @desc    Get agent settings
 * @route   GET /api/v1/settings
 * @access  Private
 */
exports.getSettings = async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('settings name email mobile company_name');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: {
        settings: agent.settings,
        profile: {
          name: agent.name,
          email: agent.email,
          mobile: agent.mobile,
          company_name: agent.company_name
        }
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update agent settings
 * @route   PUT /api/v1/settings
 * @access  Private
 */
exports.updateSettings = async (req, res) => {
  try {
    const { settings, profile } = req.body;

    const updateData = {};

    // Fetch current agent data if needed for merging settings or checking email
    let currentAgent = null;
    if (settings || profile) {
      currentAgent = await Agent.findById(req.agent._id);
    }

    // Update settings if provided - merge with existing settings
    if (settings) {
      updateData.settings = { ...currentAgent.settings };

      // Merge notifications if provided
      if (settings.notifications) {
        updateData.settings.notifications = { ...currentAgent.settings.notifications, ...settings.notifications };
      }

      // Merge security if provided
      if (settings.security) {
        updateData.settings.security = { ...currentAgent.settings.security, ...settings.security };
      }
    }

    // Update profile if provided
    if (profile) {
      if (profile.name) updateData.name = profile.name;
      if (profile.mobile) updateData.mobile = profile.mobile;
      if (profile.company_name) updateData.company_name = profile.company_name;

      // Only update email if it's different to avoid unique constraint issues
      if (profile.email && profile.email !== currentAgent.email) {
        updateData.email = profile.email;
      }
    }

    const agent = await Agent.findByIdAndUpdate(
      req.agent._id,
      updateData,
      { new: true, runValidators: true }
    ).select('settings name email mobile company_name');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        settings: agent.settings,
        profile: {
          name: agent.name,
          email: agent.email,
          mobile: agent.mobile,
          company_name: agent.company_name
        }
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update agent password
 * @route   PUT /api/v1/settings/password
 * @access  Private
 */
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password and new password'
      });
    }

    const agent = await Agent.findById(req.agent._id).select('+password');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Check current password
    if (!(await agent.correctPassword(currentPassword, agent.password))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    agent.password = newPassword;
    await agent.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
