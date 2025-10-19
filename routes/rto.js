const express = require('express');
const router = express.Router();
const rtoController = require('../controllers/rtoController');
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

// All routes require authentication
router.use(protect);

// Get all RTO offices (with pagination and filtering)
router.get('/', rtoController.getAllOffices);

// Get single RTO office by ID
router.get('/:id', rtoController.getOfficeById);

// Create new RTO office (admin only)
router.post('/', adminAuth, rtoController.createOffice);

// Update RTO office (admin only)
router.put('/:id', adminAuth, rtoController.updateOffice);

// Delete RTO office (admin only)
router.delete('/:id', adminAuth, rtoController.deleteOffice);

// Find nearest RTO offices
router.get('/nearest/find', rtoController.findNearestOffices);

// Get offices by state
router.get('/state/:state', rtoController.getOfficesByState);

// Get offices by city
router.get('/city/:city', rtoController.getOfficesByCity);

// Bulk import RTO offices (admin only)
router.post('/bulk-import', adminAuth, rtoController.bulkImportOffices);

module.exports = router;
