const assistantService = require('../services/assistantService');

/**
 * @desc    Process a natural language query from the agent
 * @route   POST /api/v1/assistant/query
 * @access  Private
 */
exports.processQuery = async (req, res) => {
  const { query, context } = req.body;
  const agentId = req.agent._id;

  if (!query) {
    return res.status(400).json({ success: false, message: 'Query is required.' });
  }

  try {
    const { response, newContext } = await assistantService.processQuery(query, agentId, context);
    res.json({ success: true, data: response, context: newContext });

  } catch (error) {
    console.error('Assistant query processing error:', error);
    res.status(500).json({
      success: false,
      data: {
        action: 'talk',
        message: "Sorry, I encountered an error while trying to understand that. Please try again."
      }
    });
  }
};