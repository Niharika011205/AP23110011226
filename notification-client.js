// Client-Side Notification Handler
class NotificationClient {
  constructor(serverUrl, userId, token) {
    this.serverUrl = serverUrl;
    this.userId = userId;
    this.token = token;
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  // Connect to WebSocket
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.serverUrl, {
          auth: {
            userId: this.userId,
            token: this.token
          },
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts
        });

        this.socket.on('connect', () => {
          console.log('Connected to notification server');
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.socket.on('disconnect', () => {
          console.log('Disconnected from notification server');
          this.emit('disconnected');
        });

        this.socket.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

        // Listen for notifications
        this.socket.on('notification_created', (notification) => {
          this.emit('notification_created', notification);
        });

        this.socket.on('priority_inbox_updated', (notifications) => {
          this.emit('priority_inbox_updated', notifications);
        });

        this.socket.on('unread_count_updated', (data) => {
          this.emit('unread_count_updated', data);
        });

        this.socket.on('notification_read', (data) => {
          this.emit('notification_read', data);
        });

        this.socket.on('notification_deleted', (data) => {
          this.emit('notification_deleted', data);
        });

        this.socket.on('all_notifications_read', () => {
          this.emit('all_notifications_read');
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // Get priority inbox
  getPriorityInbox() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('get_priority_inbox');

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

      const handler = (notifications) => {
        clearTimeout(timeout);
        this.socket.off('priority_inbox_updated', handler);
        resolve(notifications);
      };

      this.socket.on('priority_inbox_updated', handler);
    });
  }

  // Get unread count
  getUnreadCount() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('get_unread_count');

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

      const handler = (data) => {
        clearTimeout(timeout);
        this.socket.off('unread_count_updated', handler);
        resolve(data);
      };

      this.socket.on('unread_count_updated', handler);
    });
  }

  // Mark notification as read
  markAsRead(notificationId) {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    this.socket.emit('mark_read', notificationId);
  }

  // Mark all as read
  markAllAsRead() {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    this.socket.emit('mark_all_read');
  }

  // Delete notification
  deleteNotification(notificationId) {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    this.socket.emit('delete_notification', notificationId);
  }

  // Send heartbeat
  sendHeartbeat() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('ping');
    }
  }

  // Listen for events
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push(callback);
  }

  // Remove listener
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Emit event
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in listener for ${event}:`, error);
        }
      });
    }
  }

  // Check connection status
  isConnected() {
    return this.socket && this.socket.connected;
  }
}

// REST API Client
class NotificationAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  // Helper method for API calls
  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API Error');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // Get notifications
  async getNotifications(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({
      page,
      limit,
      ...filters
    });

    return this.request('GET', `/api/v1/notifications?${params}`);
  }

  // Create notification
  async createNotification(data) {
    return this.request('POST', '/api/v1/notifications', data);
  }

  // Mark as read
  async markAsRead(notificationId) {
    return this.request('PATCH', `/api/v1/notifications/${notificationId}/read`, {
      isRead: true
    });
  }

  // Mark all as read
  async markAllAsRead() {
    return this.request('PATCH', '/api/v1/notifications/read-all');
  }

  // Delete notification
  async deleteNotification(notificationId) {
    return this.request('DELETE', `/api/v1/notifications/${notificationId}`);
  }

  // Get top priority notifications
  async getTopPriority() {
    return this.request('GET', '/api/v1/notifications/priority');
  }

  // Get placement notifications
  async getPlacementNotifications() {
    return this.request('GET', '/api/v1/notifications/placement');
  }

  // Get unread count
  async getUnreadCount() {
    return this.request('GET', '/api/v1/notifications/count');
  }
}

// Usage Example
/*
const client = new NotificationClient('http://localhost:3000', 'user_123', 'token');
const api = new NotificationAPI('http://localhost:3000', 'token');

// Connect to WebSocket
await client.connect();

// Listen for new notifications
client.on('notification_created', (notification) => {
  console.log('New notification:', notification);
  updateUI(notification);
});

// Listen for priority inbox updates
client.on('priority_inbox_updated', (notifications) => {
  console.log('Priority inbox updated:', notifications);
  renderPriorityInbox(notifications);
});

// Get priority inbox
const topNotifications = await client.getPriorityInbox();
console.log('Top 10 notifications:', topNotifications);

// Mark as read
client.markAsRead('notif_123');

// Get notifications via REST API
const notifications = await api.getNotifications(1, 20, { isRead: false });
console.log('Unread notifications:', notifications);

// Cleanup
client.disconnect();
*/

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotificationClient, NotificationAPI };
}
