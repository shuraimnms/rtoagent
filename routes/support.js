const express = require('express');
const router = express.Router();
const {
  createTicket,
  getAgentTickets,
  getTicketById,
  addMessageToTicket
} = require('../controllers/supportController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/tickets').post(createTicket).get(getAgentTickets);
router.route('/tickets/:id').get(getTicketById);
router.route('/tickets/:id/messages').post(addMessageToTicket);

module.exports = router;