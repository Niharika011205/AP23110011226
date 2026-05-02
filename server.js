// Main Server Setup
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

const NotificationService = require('./notification-service');
const NotificationController = require('./notification-controller');
const WebSocketHandler = require('./websocket-handler');
const NotificationConsumer = require('./kafka-consumer');

dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Authentication middleware (simplified)
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verify token (simplified - use JWT in production)
  req.user = {
    id: req.headers['x-user-id'] || 'user_123',
    role: req.headers['x-user-role'] || 'user'
  };

  next();
});

// Initialize services
const config = {
  database: {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'notifications'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  kafka: {
    clientId: 'notification-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
  }
};

const notificationService = new NotificationService(config);
const notificationController = new NotificationController(notificationService);
const wsHandler = new WebSocketHandler(io, notificationService);

// Setup routes
const notificationRouter = notificationController.setupRoutes();
app.use('/api/v1/notifications', notificationRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket initialization
wsHandler.initialize();

// Start Kafka consumer
const consumer = new NotificationConsumer(config);

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');

  server.close(async () => {
    await notificationService.close();
    await consumer.close();
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    // Start Kafka consumer
    await consumer.start();
    console.log('Kafka consumer started');
  } catch (error) {
    console.error('Failed to start Kafka consumer:', error);
  }
});

module.exports = { app, server, io };
