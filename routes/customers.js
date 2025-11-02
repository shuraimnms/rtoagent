const express = require('express');
const { 
  createCustomer, 
  getCustomers, 
  updateCustomer, 
  deleteCustomer 
} = require('../controllers/customerController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .post(createCustomer)
  .get(getCustomers);

router.route('/:id')
  .put(updateCustomer)
  .delete(deleteCustomer);

module.exports = router;