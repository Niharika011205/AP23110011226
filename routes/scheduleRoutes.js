const express = require('express');
const router = express.Router();
const { solveKnapsack } = require('../utils/knapsack');
const { fetchAllData } = require('../services/vehicleService');

// GET /schedule - Optimize vehicle maintenance schedule
// Query params: maxHours (default: 8)
router.get('/schedule', async (req, res) => {
  try {
    const maxHours = parseInt(req.query.maxHours) || 8;

    // Validate input
    if (maxHours <= 0) {
      return res.status(400).json({
        error: 'maxHours must be greater than 0',
      });
    }

    // Fetch vehicle data
    const { vehicles } = await fetchAllData();

    // Validate vehicles data
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return res.status(400).json({
        error: 'No vehicles available',
      });
    }

    // Solve knapsack problem
    const result = solveKnapsack(vehicles, maxHours);

    // Return optimized schedule
    res.json({
      selectedVehicles: result.selectedVehicles,
      totalScore: result.totalScore,
      totalHours: result.totalHours,
      maxHours: maxHours,
      vehicleCount: result.selectedVehicles.length,
    });
  } catch (error) {
    console.error('[ERROR] Schedule endpoint error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// GET /schedule/details - Get detailed schedule with vehicle information
router.get('/schedule/details', async (req, res) => {
  try {
    const maxHours = parseInt(req.query.maxHours) || 8;

    if (maxHours <= 0) {
      return res.status(400).json({
        error: 'maxHours must be greater than 0',
      });
    }

    const { vehicles } = await fetchAllData();

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return res.status(400).json({
        error: 'No vehicles available',
      });
    }

    const result = solveKnapsack(vehicles, maxHours);

    // Enrich with vehicle details
    const selectedVehicleDetails = result.selectedVehicles.map((vehicleId) => {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      return {
        id: vehicle.id,
        estimatedServiceDuration: vehicle.estimatedServiceDuration,
        operationalImpactScore: vehicle.operationalImpactScore,
      };
    });

    res.json({
      selectedVehicles: selectedVehicleDetails,
      totalScore: result.totalScore,
      totalHours: result.totalHours,
      maxHours: maxHours,
      vehicleCount: result.selectedVehicles.length,
    });
  } catch (error) {
    console.error('[ERROR] Schedule details endpoint error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// GET /health - Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
