const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  reminder_type: {
    type: String,
    enum: [
      'vehicle_insurance_reminder',
      'puc_certificate_reminder',
      'fitness_certificate_reminder',
      'driving_license_reminder',
      'road_tax_reminder',
      'noc_hypothecation_reminder'
    ],
    required: true
  },
  vehicle_number: String,
  license_number: String,
  vehicle_type: String,
  expiry_date: {
    type: Date,
    required: true
  },
  lead_times: {
    type: [Number],
    default: [30, 7, 3, 1]
  },
  scheduled_dates: [Date],
  next_send_date: Date,
  status: {
    type: String,
    enum: ['PENDING', 'ENQUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'COMPLETED'],
    default: 'PENDING'
  },
  language: {
    type: String,
    enum: ['en', 'hi', 'te'],
    default: 'en'
  },
  sent_count: {
    type: Number,
    default: 0
  },
  last_sent_date: Date
}, {
  timestamps: true
});

reminderSchema.pre('save', function(next) {
  if (this.isModified('expiry_date') || this.isModified('lead_times')) {
    this.scheduled_dates = this.lead_times.map(days => {
      const date = new Date(this.expiry_date);
      date.setHours(0, 0, 0, 0); // Set time to midnight UTC for consistency

      date.setDate(date.getDate() - days);
      return date;
    });

    const now = new Date();
    // Filter for dates in the future, and sort to get the earliest upcoming date
    const upcomingDates = this.scheduled_dates
      .filter(date => date > now)
      .sort((a, b) => a.getTime() - b.getTime()); // Sort ascending to get the next_send_date

    this.next_send_date = upcomingDates.length > 0 ? upcomingDates[0] : null;

    if (!this.next_send_date) {
      this.status = 'COMPLETED';
    }
  }
  next();
});

module.exports = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);
