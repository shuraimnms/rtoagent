const express = require('express');
const multer = require('multer');
const { importCSV } = require('../controllers/importController');
const { protect } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(protect);

router.post('/csv', upload.single('file'), importCSV);

module.exports = router;