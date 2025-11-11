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
    const setOperators = {}; // Use $set for specific nested paths

    // Fetch current agent data if needed for merging settings or checking email
    let currentAgent = null;
    if (settings || profile) {
      currentAgent = await Agent.findById(req.agent._id);
      if (!currentAgent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found'
        });
      }
    }

    // Update settings if provided - use $set for nested fields
    if (settings) {
      if (settings.notifications) {
        for (const key in settings.notifications) {
          setOperators[`settings.notifications.${key}`] = settings.notifications[key];
        }
      }
      if (settings.security) {
        for (const key in settings.security) {
          setOperators[`settings.security.${key}`] = settings.security[key];
        }
      }
      // Handle other top-level settings fields if they exist (e.g., per_message_cost, signature)
      if (settings.per_message_cost !== undefined) {
        setOperators['settings.per_message_cost'] = settings.per_message_cost;
      }
      if (settings.signature !== undefined) {
        setOperators['settings.signature'] = settings.signature;
      }
    }

    // Update profile if provided
    if (profile) {
      if (profile.name) setOperators['name'] = profile.name;
      if (profile.mobile) setOperators['mobile'] = profile.mobile;
      if (profile.company_name) setOperators['company_name'] = profile.company_name;

      // Only update email if it's different to avoid unique constraint issues
      if (profile.email && profile.email !== currentAgent.email) {
        setOperators['email'] = profile.email;
      }
    }

    // If there are no updates, return early
    if (Object.keys(setOperators).length === 0) {
      return res.json({
        success: true,
        message: 'No changes to update',
        data: {
          settings: currentAgent.settings,
          profile: {
            name: currentAgent.name,
            email: currentAgent.email,
            mobile: currentAgent.mobile,
            company_name: currentAgent.company_name
          }
        }
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.agent._id,
      { $set: setOperators }, // Use $set operator for atomic updates of nested fields
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
