// REST API Controller
const express = require('express');
const router = express.Router();

class NotificationController {
  constructor(notificationService) {
    this.service = notificationService;
  }

  // POST /api/v1/notifications - Create notification
  async createNotification(req, res) {
    try {
      const { title, message, type, priority, metadata } = req.body;
      const recipientId = req.user.id;

      if (!title || !message || !type) {
        return res.status(400).json({
          error: 'Missing required fields: title, message, type'
        });
      }

      const notification = await this.service.createNotification({
        recipientId,
        type,
        title,
        message,
        priority,
        metadata
      });

      res.status(201).json(notification);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET /api/v1/notifications - Get notifications
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const {
        page = 1,
        limit = 20,
        isRead,
        type,
        days = 30
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100), // Max 100 per page
        isRead: isRead !== undefined ? isRead === 'true' : null,
        type: type || null,
        days: parseInt(days)
      };

      const result = await this.service.getNotifications(userId, options);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET /api/v1/notifications/count - Get unread count
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const result = await this.service.getUnreadCount(userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET /api/v1/notifications/priority - Get top 10 priority notifications
  async getTopPriority(req, res) {
    try {
      const userId = req.user.id;
      const notifications = await this.service.getTopPriorityNotifications(userId);
      res.json({ data: notifications });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET /api/v1/notifications/placement - Get placement notifications (7 days)
  async getPlacementNotifications(req, res) {
    try {
      const userId = req.user.id;
      const notifications = await this.service.getPlacementNotifications(userId);
      res.json({ data: notifications });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // PATCH /api/v1/notifications/:id/read - Mark as read
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const notification = await this.service.markAsRead(id, userId);
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // PATCH /api/v1/notifications/read-all - Mark all as read
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      const result = await this.service.markAllAsRead(userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // DELETE /api/v1/notifications/:id - Delete notification
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      await this.service.deleteNotification(id, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // POST /api/v1/notifications/broadcast - Notify all users
  async notifyAll(req, res) {
    try {
      // Check admin permission
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const { title, content, type } = req.body;

      if (!title || !content) {
        return res.status(400).json({
          error: 'Missing required fields: title, content'
        });
      }

      const result = await this.service.notifyAll({
        title,
        content,
        type: type || 'event'
      });

      res.status(202).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Setup routes
  setupRoutes() {
    router.post('/', this.createNotification.bind(this));
    router.get('/', this.getNotifications.bind(this));
    router.get('/count', this.getUnreadCount.bind(this));
    router.get('/priority', this.getTopPriority.bind(this));
    router.get('/placement', this.getPlacementNotifications.bind(this));
    router.patch('/:id/read', this.markAsRead.bind(this));
    router.patch('/read-all', this.markAllAsRead.bind(this));
    router.delete('/:id', this.deleteNotification.bind(this));
    router.post('/broadcast', this.notifyAll.bind(this));

    return router;
  }
}

module.exports = NotificationController;
