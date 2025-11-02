const express = require('express');
<<<<<<< HEAD
const { handleWebhook, handleCashfreeWebhook } = require('../controllers/webhookController');
=======
const { handleWebhook } = require('../controllers/webhookController');
>>>>>>> d14d0c85b1d128149b48b68dce6f3db03885e37c

const router = express.Router();

router.post('/msg91', handleWebhook);
<<<<<<< HEAD
router.post('/cashfree', express.raw({ type: 'application/json' }), handleCashfreeWebhook);
=======
>>>>>>> d14d0c85b1d128149b48b68dce6f3db03885e37c

module.exports = router;
