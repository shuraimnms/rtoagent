const RTO = require('../models/RTO');
const mongoose = require('mongoose');

// Get all RTO offices with pagination and filtering
exports.getAllOffices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      state,
      city,
      service,
      isActive = true
    } = req.query;

    const query = { isActive: isActive === 'true' };

    // Search functionality
    if (search) {
      query.$or = [
        { officeName: new RegExp(search, 'i') },
        { officeCode: new RegExp(search, 'i') },
        { 'address.city': new RegExp(search, 'i') },
        { 'address.state': new RegExp(search, 'i') }
      ];
    }

    // Filter by state
    if (state) {
      query['address.state'] = new RegExp(state, 'i');
    }

    // Filter by city
    if (city) {
      query['address.city'] = new RegExp(city, 'i');
    }

    // Filter by service
    if (service) {
      query.services = service;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { officeName: 1 },
      populate: {
        path: 'createdBy',
        select: 'name email'
      }
    };

    const result = await RTO.paginate(query, options);

    res.json({
      success: true,
      data: result.docs,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        pages: result.totalPages,
        limit: result.limit
      }
    });
  } catch (error) {
    console.error('Error fetching RTO offices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching RTO offices',
      error: error.message
    });
  }
};

// Get single RTO office by ID
exports.getOfficeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid RTO office ID'
      });
    }

    const office = await RTO.findById(id).populate('createdBy', 'name email');

    if (!office) {
      return res.status(404).json({
        success: false,
        message: 'RTO office not found'
      });
    }

    res.json({
      success: true,
      data: office
    });
  } catch (error) {
    console.error('Error fetching RTO office:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching RTO office',
      error: error.message
    });
  }
};

// Create new RTO office
exports.createOffice = async (req, res) => {
  try {
    const officeData = {
      ...req.body,
      createdBy: req.agent ? req.agent._id : null
    };

    // Validate required fields
    const requiredFields = ['officeCode', 'officeName', 'address.city', 'address.state', 'address.pincode', 'location.coordinates'];
    const missingFields = requiredFields.filter(field => {
      const keys = field.split('.');
      let value = officeData;
      for (const key of keys) {
        value = value?.[key];
      }
      return !value;
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Check if office code already exists
    const existingOffice = await RTO.findOne({ officeCode: officeData.officeCode });
    if (existingOffice) {
      return res.status(400).json({
        success: false,
        message: 'RTO office with this code already exists'
      });
    }

    const office = new RTO(officeData);
    await office.save();

    res.status(201).json({
      success: true,
      data: office,
      message: 'RTO office created successfully'
    });
  } catch (error) {
    console.error('Error creating RTO office:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'RTO office code must be unique'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating RTO office',
      error: error.message
    });
  }
};

// Update RTO office
exports.updateOffice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid RTO office ID'
      });
    }

    const updateData = {
      ...req.body,
      lastUpdated: new Date()
    };

    const office = await RTO.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!office) {
      return res.status(404).json({
        success: false,
        message: 'RTO office not found'
      });
    }

    res.json({
      success: true,
      data: office,
      message: 'RTO office updated successfully'
    });
  } catch (error) {
    console.error('Error updating RTO office:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'RTO office code must be unique'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating RTO office',
      error: error.message
    });
  }
};

// Delete RTO office
exports.deleteOffice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid RTO office ID'
      });
    }

    const office = await RTO.findByIdAndDelete(id);

    if (!office) {
      return res.status(404).json({
        success: false,
        message: 'RTO office not found'
      });
    }

    res.json({
      success: true,
      message: 'RTO office deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting RTO office:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting RTO office',
      error: error.message
    });
  }
};

// Find nearest RTO offices
exports.findNearestOffices = async (req, res) => {
  try {
    const {
      longitude,
      latitude,
      maxDistance = 50000, // 50km default
      limit = 10
    } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }

    const offices = await RTO.findNearest(
      parseFloat(longitude),
      parseFloat(latitude),
      parseInt(maxDistance),
      parseInt(limit)
    ).populate('createdBy', 'name email');

    res.json({
      success: true,
      data: offices,
      count: offices.length
    });
  } catch (error) {
    console.error('Error finding nearest offices:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding nearest offices',
      error: error.message
    });
  }
};

// Get offices by state
exports.getOfficesByState = async (req, res) => {
  try {
    const { state } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const query = RTO.findByState(state);
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { officeName: 1 },
      populate: {
        path: 'createdBy',
        select: 'name email'
      }
    };

    const result = await RTO.paginate(query, options);

    res.json({
      success: true,
      data: result.docs,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        pages: result.totalPages,
        limit: result.limit
      }
    });
  } catch (error) {
    console.error('Error fetching offices by state:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching offices by state',
      error: error.message
    });
  }
};

// Get offices by city
exports.getOfficesByCity = async (req, res) => {
  try {
    const { city } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const query = RTO.findByCity(city);
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { officeName: 1 },
      populate: {
        path: 'createdBy',
        select: 'name email'
      }
    };

    const result = await RTO.paginate(query, options);

    res.json({
      success: true,
      data: result.docs,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        pages: result.totalPages,
        limit: result.limit
      }
    });
  } catch (error) {
    console.error('Error fetching offices by city:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching offices by city',
      error: error.message
    });
  }
};

// Bulk import RTO offices
exports.bulkImportOffices = async (req, res) => {
  try {
    const { offices } = req.body;

    if (!Array.isArray(offices) || offices.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Offices array is required and cannot be empty'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const officeData of offices) {
      try {
        const office = new RTO({
          ...officeData,
          createdBy: req.agent ? req.agent._id : null
        });

        await office.save();
        results.successful.push({
          officeCode: office.officeCode,
          officeName: office.officeName
        });
      } catch (error) {
        results.failed.push({
          data: officeData,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.successful.length} offices, ${results.failed.length} failed`
    });
  } catch (error) {
    console.error('Error bulk importing offices:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk importing offices',
      error: error.message
    });
  }
};
