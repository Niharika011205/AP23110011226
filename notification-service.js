// Notification Service - Core Business Logic
const { Pool } = require('pg');
const redis = require('redis');
const { Kafka } = require('kafkajs');

class NotificationService {
  constructor(config) {
    this.db = new Pool(config.database);
    this.redis = redis.createClient(config.redis);
    this.kafka = new Kafka(config.kafka);
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'notification-service' });
  }

  // Create notification
  async createNotification(data) {
    const query = `
      INSERT INTO notifications 
      (recipient_id, type, title, message, priority, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      data.recipientId,
      data.type,
      data.title,
      data.message,
      data.priority || 'medium',
      JSON.stringify(data.metadata || {})
    ]);

    const notification = result.rows[0];

    // Publish to Kafka for real-time delivery
    await this.producer.send({
      topic: 'notifications.created',
      messages: [{
        key: notification.recipient_id,
        value: JSON.stringify(notification)
      }]
    });

    // Invalidate cache
    await this.redis.del(`notifications:unread:${data.recipientId}`);

    return notification;
  }

  // Get notifications with pagination
  async getNotifications(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      isRead = null,
      type = null,
      days = 30
    } = options;

    const offset = (page - 1) * limit;

    let query = `
      SELECT id, recipient_id, type, title, message, priority, is_read, created_at
      FROM notifications
      WHERE recipient_id = $1
        AND deleted_at IS NULL
        AND created_at >= NOW() - INTERVAL '${days} days'
    `;

    const params = [userId];

    if (isRead !== null) {
      query += ` AND is_read = $${params.length + 1}`;
      params.push(isRead);
    }

    if (type) {
      query += ` AND type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM notifications
      WHERE recipient_id = $1 AND deleted_at IS NULL
    `;
    const countParams = [userId];

    if (isRead !== null) {
      countQuery += ` AND is_read = $${countParams.length + 1}`;
      countParams.push(isRead);
    }

    const countResult = await this.db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Get unread count (with caching)
  async getUnreadCount(userId) {
    const cacheKey = `notifications:unread:${userId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const result = await this.db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE recipient_id = $1 AND is_read = false',
      [userId]
    );

    const count = parseInt(result.rows[0].count);

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify({ count }));

    return { count };
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    const query = `
      UPDATE notifications
      SET is_read = true, updated_at = NOW()
      WHERE id = $1 AND recipient_id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [notificationId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    // Invalidate cache
    await this.redis.del(`notifications:unread:${userId}`);

    // Publish event
    await this.producer.send({
      topic: 'notifications.read',
      messages: [{
        key: userId,
        value: JSON.stringify({ notificationId, userId })
      }]
    });

    return result.rows[0];
  }

  // Mark all as read
  async markAllAsRead(userId) {
    const query = `
      UPDATE notifications
      SET is_read = true, updated_at = NOW()
      WHERE recipient_id = $1 AND is_read = false
      RETURNING id
    `;

    const result = await this.db.query(query, [userId]);

    // Invalidate cache
    await this.redis.del(`notifications:unread:${userId}`);

    return { updatedCount: result.rows.length };
  }

  // Delete notification
  async deleteNotification(notificationId, userId) {
    const query = `
      UPDATE notifications
      SET deleted_at = NOW()
      WHERE id = $1 AND recipient_id = $2
    `;

    await this.db.query(query, [notificationId, userId]);

    // Invalidate cache
    await this.redis.del(`notifications:unread:${userId}`);

    return { success: true };
  }

  // Get top 10 priority notifications
  async getTopPriorityNotifications(userId) {
    const query = `
      SELECT 
        id, recipient_id, type, title, message, priority, is_read, created_at,
        CASE 
          WHEN type = 'placement' THEN 100
          WHEN type = 'result' THEN 50
          WHEN type = 'event' THEN 10
          ELSE 0
        END * 0.8 + 
        GREATEST(0, 100 - (EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 * 5)) * 0.2 
        AS priority_score
      FROM notifications
      WHERE recipient_id = $1 AND deleted_at IS NULL
      ORDER BY priority_score DESC, created_at DESC
      LIMIT 10
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows;
  }

  // Get placement notifications from last 7 days
  async getPlacementNotifications(userId) {
    const query = `
      SELECT id, recipient_id, type, title, message, priority, created_at
      FROM notifications
      WHERE recipient_id = $1
        AND type = 'placement'
        AND created_at >= NOW() - INTERVAL '7 days'
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows;
  }

  // Notify all users (broadcast)
  async notifyAll(message) {
    const notification = await this.createNotification({
      recipientId: 'broadcast',
      type: message.type || 'event',
      title: message.title,
      message: message.content,
      priority: 'high',
      metadata: { isBroadcast: true }
    });

    // Publish to Kafka for async processing
    await this.producer.send({
      topic: 'notifications.broadcast',
      messages: [{
        key: notification.id,
        value: JSON.stringify({
          notificationId: notification.id,
          message: message.content,
          timestamp: Date.now()
        })
      }]
    });

    return { notificationId: notification.id, status: 'queued' };
  }

  // Start consumer for processing
  async startConsumer() {
    await this.consumer.subscribe({ topic: 'notifications.broadcast' });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const notification = JSON.parse(message.value);

        try {
          await this.processBroadcastNotification(notification);
        } catch (error) {
          console.error('Error processing notification:', error);
          await this.sendToDeadLetterQueue(message, error);
        }
      }
    });
  }

  // Process broadcast notification
  async processBroadcastNotification(notification, retryCount = 0) {
    const maxRetries = 3;
    const backoffMs = Math.pow(2, retryCount) * 1000;

    try {
      const batchSize = 1000;
      let offset = 0;

      while (true) {
        const users = await this.getUsersBatch(offset, batchSize);
        if (users.length === 0) break;

        await Promise.all(
          users.map(user =>
            this.sendNotificationWithRetry(notification, user)
          )
        );

        offset += batchSize;
      }

      await this.markNotificationProcessed(notification.notificationId);

    } catch (error) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.processBroadcastNotification(notification, retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  // Send notification with retry
  async sendNotificationWithRetry(notification, user, retryCount = 0) {
    const maxRetries = 3;
    const backoffMs = Math.pow(2, retryCount) * 1000;

    try {
      // Send email
      await this.emailService.send({
        to: user.email,
        subject: notification.title,
        body: notification.message
      });

      // Log delivery
      await this.logDelivery({
        notificationId: notification.notificationId,
        userId: user.id,
        channel: 'email',
        status: 'sent'
      });

    } catch (error) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.sendNotificationWithRetry(notification, user, retryCount + 1);
      } else {
        await this.logDelivery({
          notificationId: notification.notificationId,
          userId: user.id,
          channel: 'email',
          status: 'failed',
          error: error.message
        });
        throw error;
      }
    }
  }

  // Helper methods
  async getUsersBatch(offset, limit) {
    const result = await this.db.query(
      'SELECT id, email FROM users LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  async markNotificationProcessed(notificationId) {
    await this.db.query(
      'UPDATE notifications SET status = $1 WHERE id = $2',
      ['processed', notificationId]
    );
  }

  async logDelivery(data) {
    const query = `
      INSERT INTO notification_delivery_log 
      (notification_id, recipient_id, channel, status, last_error)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await this.db.query(query, [
      data.notificationId,
      data.userId,
      data.channel,
      data.status,
      data.error || null
    ]);
  }

  async sendToDeadLetterQueue(message, error) {
    await this.producer.send({
      topic: 'notifications.dlq',
      messages: [{
        value: JSON.stringify({
          originalMessage: message,
          error: error.message,
          timestamp: Date.now()
        })
      }]
    });
  }

  async close() {
    await this.db.end();
    await this.redis.quit();
    await this.producer.disconnect();
    await this.consumer.disconnect();
  }
}

module.exports = NotificationService;
