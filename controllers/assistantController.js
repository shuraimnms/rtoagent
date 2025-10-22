const assistantService = require('../services/assistantService');

/**
 * @desc    Process a natural language query from the agent
 * @route   POST /api/v1/assistant/query
 * @access  Public/Private
 */
exports.processQuery = async (req, res) => {
  console.log('Assistant Controller: Received query request');
  const { query, context } = req.body;
  const agentId = req.agent ? req.agent._id : null; // Allow null for unauthenticated
  console.log(`Assistant Controller: Query: "${query}", Agent ID: ${agentId}, Context:`, context);

  if (!query) {
    return res.status(400).json({ success: false, message: 'Query is required.' });
  }

  try {
    console.log('Assistant Controller: Calling assistantService.processQuery...');
    const { action, message, data, newContext } = await assistantService.processQuery(query, agentId, context);
    res.json({ success: true, data: { action, message, data }, context: newContext });

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
