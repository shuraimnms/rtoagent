const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/support');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Agent routes
router.post('/tickets', protect, upload.array('attachments', 5), supportController.createTicket);
router.get('/tickets', protect, supportController.getAgentTickets);
router.get('/tickets/:id', protect, supportController.getTicket);
router.put('/tickets/:id', protect, supportController.updateTicket);
router.delete('/tickets/:id', protect, supportController.deleteTicket);
router.post('/tickets/:id/messages', protect, upload.array('attachments', 5), supportController.addMessage);
router.post('/tickets/:id/rate', protect, supportController.rateTicket);

// Admin routes
router.get('/admin/tickets', protect, authorize('admin', 'super_admin'), supportController.getAllTickets);
router.put('/admin/tickets/:id/assign', protect, authorize('admin', 'super_admin'), supportController.assignTicket);
router.put('/admin/tickets/:id/status', protect, authorize('admin', 'super_admin'), supportController.updateTicketStatus);
router.delete('/admin/tickets/delete-all', protect, authorize('admin', 'super_admin'), supportController.deleteAllTickets);
router.get('/admin/analytics', protect, authorize('admin', 'super_admin'), supportController.getAnalytics);

module.exports = router;
