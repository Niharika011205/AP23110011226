// Priority Inbox - Efficient Top 10 Maintenance
const redis = require('redis');

class PriorityInbox {
  constructor(userId, redisClient) {
    this.userId = userId;
    this.redis = redisClient;
    this.key = `priority_inbox:${userId}`;
    this.maxSize = 10;
    this.expirySeconds = 30 * 24 * 60 * 60; // 30 days
  }

  // Calculate priority score
  calculateScore(notification) {
    const typeScores = {
      'placement': 100,
      'result': 50,
      'event': 10
    };

    const typeScore = typeScores[notification.type] || 0;

    // Recency score: newer = higher (0-100)
    // Decays by 5 points per hour
    const ageInHours = (Date.now() - notification.createdAt) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - (ageInHours * 5));

    // Combined score: 80% type, 20% recency
    const totalScore = (typeScore * 0.8) + (recencyScore * 0.2);

    return totalScore;
  }

  // Add new notification
  async addNotification(notification) {
    const score = this.calculateScore(notification);

    // Add to sorted set
    await this.redis.zadd(
      this.key,
      score,
      JSON.stringify(notification)
    );

    // Keep only top 10
    const size = await this.redis.zcard(this.key);
    if (size > this.maxSize) {
      // Remove lowest scoring item
      await this.redis.zpopmin(this.key, 1);
    }

    // Set expiry
    await this.redis.expire(this.key, this.expirySeconds);
  }

  // Get top 10 notifications
  async getTop10() {
    const items = await this.redis.zrevrange(
      this.key,
      0,
      this.maxSize - 1,
      'WITHSCORES'
    );

    const notifications = [];
    for (let i = 0; i < items.length; i += 2) {
      if (items[i]) {
        notifications.push({
          ...JSON.parse(items[i]),
          score: parseFloat(items[i + 1])
        });
      }
    }

    return notifications;
  }

  // Update notification (mark as read)
  async updateNotification(notificationId, updates) {
    const items = await this.redis.zrange(this.key, 0, -1);

    for (const item of items) {
      const notif = JSON.parse(item);
      if (notif.id === notificationId) {
        // Update notification
        const updated = { ...notif, ...updates };
        const newScore = this.calculateScore(updated);

        // Remove old entry
        await this.redis.zrem(this.key, item);

        // Add updated entry
        await this.redis.zadd(this.key, newScore, JSON.stringify(updated));

        // Maintain top 10
        const size = await this.redis.zcard(this.key);
        if (size > this.maxSize) {
          await this.redis.zpopmin(this.key, 1);
        }

        return updated;
      }
    }

    return null;
  }

  // Mark as read
  async markAsRead(notificationId) {
    return this.updateNotification(notificationId, { isRead: true });
  }

  // Delete notification
  async deleteNotification(notificationId) {
    const items = await this.redis.zrange(this.key, 0, -1);

    for (const item of items) {
      const notif = JSON.parse(item);
      if (notif.id === notificationId) {
        await this.redis.zrem(this.key, item);
        return true;
      }
    }

    return false;
  }

  // Get count
  async getCount() {
    return this.redis.zcard(this.key);
  }

  // Clear all
  async clear() {
    await this.redis.del(this.key);
  }

  // Get by rank (0 = highest priority)
  async getByRank(rank) {
    const items = await this.redis.zrevrange(this.key, rank, rank, 'WITHSCORES');

    if (items.length === 0) {
      return null;
    }

    return {
      ...JSON.parse(items[0]),
      score: parseFloat(items[1])
    };
  }

  // Get range by rank
  async getRangeByRank(start, end) {
    const items = await this.redis.zrevrange(
      this.key,
      start,
      end,
      'WITHSCORES'
    );

    const notifications = [];
    for (let i = 0; i < items.length; i += 2) {
      if (items[i]) {
        notifications.push({
          ...JSON.parse(items[i]),
          score: parseFloat(items[i + 1])
        });
      }
    }

    return notifications;
  }

  // Recalculate all scores (useful for periodic updates)
  async recalculateScores(notifications) {
    await this.clear();

    for (const notif of notifications) {
      const score = this.calculateScore(notif);
      await this.redis.zadd(this.key, score, JSON.stringify(notif));
    }

    // Keep only top 10
    const size = await this.redis.zcard(this.key);
    if (size > this.maxSize) {
      await this.redis.zpopmin(this.key, size - this.maxSize);
    }

    await this.redis.expire(this.key, this.expirySeconds);
  }
}

// Priority Inbox Manager - Manages multiple inboxes
class PriorityInboxManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.inboxes = new Map();
  }

  // Get or create inbox
  getInbox(userId) {
    if (!this.inboxes.has(userId)) {
      this.inboxes.set(userId, new PriorityInbox(userId, this.redis));
    }
    return this.inboxes.get(userId);
  }

  // Add notification to user's inbox
  async addNotification(userId, notification) {
    const inbox = this.getInbox(userId);
    await inbox.addNotification(notification);
  }

  // Get top 10 for user
  async getTop10(userId) {
    const inbox = this.getInbox(userId);
    return inbox.getTop10();
  }

  // Mark as read
  async markAsRead(userId, notificationId) {
    const inbox = this.getInbox(userId);
    return inbox.markAsRead(notificationId);
  }

  // Delete notification
  async deleteNotification(userId, notificationId) {
    const inbox = this.getInbox(userId);
    return inbox.deleteNotification(notificationId);
  }

  // Clear inbox
  async clearInbox(userId) {
    const inbox = this.getInbox(userId);
    await inbox.clear();
    this.inboxes.delete(userId);
  }
}

module.exports = { PriorityInbox, PriorityInboxManager };
