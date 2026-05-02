// WebSocket Handler for Real-Time Notifications
const redis = require('redis');

class WebSocketHandler {
  constructor(io, notificationService) {
    this.io = io;
    this.service = notificationService;
    this.redis = redis.createClient();
    this.userConnections = new Map();
  }

  // Initialize WebSocket connections
  initialize() {
    this.io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId;

      if (!userId) {
        socket.disconnect();
        return;
      }

      console.log(`User ${userId} connected`);

      // Track user connection
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, []);
      }
      this.userConnections.get(userId).push(socket.id);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Handle get priority inbox
      socket.on('get_priority_inbox', async () => {
        try {
          const notifications = await this.service.getTopPriorityNotifications(userId);
          socket.emit('priority_inbox_updated', notifications);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle get unread count
      socket.on('get_unread_count', async () => {
        try {
          const result = await this.service.getUnreadCount(userId);
          socket.emit('unread_count_updated', result);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle mark as read
      socket.on('mark_read', async (notificationId) => {
        try {
          await this.service.markAsRead(notificationId, userId);

          // Broadcast to all user's connections
          this.io.to(`user:${userId}`).emit('notification_read', {
            notificationId
          });

          // Update priority inbox
          const notifications = await this.service.getTopPriorityNotifications(userId);
          this.io.to(`user:${userId}`).emit('priority_inbox_updated', notifications);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle mark all as read
      socket.on('mark_all_read', async () => {
        try {
          await this.service.markAllAsRead(userId);

          this.io.to(`user:${userId}`).emit('all_notifications_read');

          // Update priority inbox
          const notifications = await this.service.getTopPriorityNotifications(userId);
          this.io.to(`user:${userId}`).emit('priority_inbox_updated', notifications);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle delete notification
      socket.on('delete_notification', async (notificationId) => {
        try {
          await this.service.deleteNotification(notificationId, userId);

          this.io.to(`user:${userId}`).emit('notification_deleted', {
            notificationId
          });

          // Update priority inbox
          const notifications = await this.service.getTopPriorityNotifications(userId);
          this.io.to(`user:${userId}`).emit('priority_inbox_updated', notifications);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Heartbeat
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected`);

        const connections = this.userConnections.get(userId);
        if (connections) {
          const index = connections.indexOf(socket.id);
          if (index > -1) {
            connections.splice(index, 1);
          }
          if (connections.length === 0) {
            this.userConnections.delete(userId);
          }
        }
      });
    });

    // Listen for new notifications from Kafka
    this.subscribeToNotifications();
  }

  // Subscribe to notification events
  subscribeToNotifications() {
    const subscriber = redis.createClient();

    subscriber.subscribe('notifications:created', (err, count) => {
      if (err) {
        console.error('Failed to subscribe:', err);
      } else {
        console.log(`Subscribed to ${count} channel(s)`);
      }
    });

    subscriber.on('message', async (channel, message) => {
      const notification = JSON.parse(message);
      const userId = notification.recipient_id;

      // Emit to user's WebSocket connections
      this.io.to(`user:${userId}`).emit('notification_created', notification);

      // Update priority inbox
      try {
        const topNotifications = await this.service.getTopPriorityNotifications(userId);
        this.io.to(`user:${userId}`).emit('priority_inbox_updated', topNotifications);

        // Update unread count
        const unreadCount = await this.service.getUnreadCount(userId);
        this.io.to(`user:${userId}`).emit('unread_count_updated', unreadCount);
      } catch (error) {
        console.error('Error updating inbox:', error);
      }
    });
  }

  // Emit notification to user
  async emitToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Emit to all connected users
  async emitToAll(event, data) {
    this.io.emit(event, data);
  }

  // Get user connection status
  isUserConnected(userId) {
    return this.userConnections.has(userId) && this.userConnections.get(userId).length > 0;
  }
}

module.exports = WebSocketHandler;
