const csv = require('csv-parser');
const fs = require('fs');
const Customer = require('../models/Customer');
const Reminder = require('../models/Reminder');

exports.importCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }

    const results = [];
    const errors = [];
    const createdCustomers = [];
    const createdReminders = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      try {
        if (!row.name || !row.mobile || !row.vehicle_number || !row.reminder_type || !row.expiry_date) {
          errors.push(`Row ${i + 2}: Missing required fields`);
          continue;
        }

        if (!/^\+\d{10,15}$/.test(row.mobile)) {
          errors.push(`Row ${i + 2}: Invalid mobile format`);
          continue;
        }

        const expiryDate = new Date(row.expiry_date);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
          errors.push(`Row ${i + 2}: Invalid or past expiry date`);
          continue;
        }

        let customer = await Customer.findOne({
          mobile: row.mobile,
          created_by_agent: req.agent._id
        });

        if (!customer) {
          customer = await Customer.create({
            name: row.name,
            mobile: row.mobile,
            email: row.email || '',
            vehicle_number: row.vehicle_number,
            language: row.language || 'en',
            created_by_agent: req.agent._id
          });
          createdCustomers.push(customer);
        }

        const lead_times = row.days_before ? 
          row.days_before.split(';').map(Number) : [30, 7, 3, 1];

        const reminder = await Reminder.create({
          customer: customer._id,
          agent: req.agent._id,
          reminder_type: row.reminder_type,
          vehicle_number: row.vehicle_number,
          expiry_date: expiryDate,
          lead_times: lead_times,
          language: row.language || 'en'
        });

        createdReminders.push(reminder);

      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      data: {
        customers_created: createdCustomers.length,
        reminders_created: createdReminders.length,
        errors: errors
      },
      message: `Import completed with ${errors.length} errors`
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};