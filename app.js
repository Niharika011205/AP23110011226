const express = require('express');
const loggingMiddleware = require('./middleware/logger');
const scheduleRoutes = require('./routes/scheduleRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(loggingMiddleware);

// Routes
app.use('/', scheduleRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[SERVER] Vehicle Maintenance Scheduler running on port ${PORT}`);
  console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
  console.log(`[SERVER] Schedule endpoint: http://localhost:${PORT}/schedule?maxHours=8`);
});

module.exports = app;
