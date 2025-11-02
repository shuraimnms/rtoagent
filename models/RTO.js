const mongoose = require('mongoose');

const rtoSchema = new mongoose.Schema({
  officeCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  officeName: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: String,
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    pincode: {
      type: String,
      required: true,
      trim: true
    }
  },
  contact: {
    phone: String,
    email: String,
    fax: String
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  workingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  services: [{
    type: String,
    enum: ['Registration', 'License', 'Permit', 'Insurance', 'Fitness', 'Pollution']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for geospatial queries
rtoSchema.index({ location: '2dsphere' });

// Index for text search
rtoSchema.index({
  officeName: 'text',
  'address.city': 'text',
  'address.state': 'text',
  officeCode: 'text'
});

// Virtual for full address
rtoSchema.virtual('fullAddress').get(function() {
  return `${this.address.street || ''}, ${this.address.city}, ${this.address.state} - ${this.address.pincode}`;
});

// Instance method to check if office is open
rtoSchema.methods.isOpen = function(dayOfWeek, time) {
  const daySchedule = this.workingHours[dayOfWeek.toLowerCase()];
  if (!daySchedule || !daySchedule.open || !daySchedule.close) return false;

  const openTime = daySchedule.open;
  const closeTime = daySchedule.close;
  const currentTime = time || new Date().toTimeString().slice(0, 5);

  return currentTime >= openTime && currentTime <= closeTime;
};

// Static method to find nearest offices
rtoSchema.statics.findNearest = function(longitude, latitude, maxDistance = 50000, limit = 10) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    isActive: true
  }).limit(limit);
};

// Static method to find offices by state
rtoSchema.statics.findByState = function(state) {
  return this.find({
    'address.state': new RegExp(state, 'i'),
    isActive: true
  });
};

// Static method to find offices by city
rtoSchema.statics.findByCity = function(city) {
  return this.find({
    'address.city': new RegExp(city, 'i'),
    isActive: true
  });
};

module.exports = mongoose.model('RTO', rtoSchema);
