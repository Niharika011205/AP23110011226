// Kafka Consumer for Broadcast Notifications
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');

class NotificationConsumer {
  constructor(config) {
    this.kafka = new Kafka(config.kafka);
    this.db = new Pool(config.database);
    this.emailService = config.emailService;
    this.config = config;
  }

  // Start consumer
  async start() {
    const consumer = this.kafka.consumer({ groupId: 'notification-broadcast' });

    await consumer.connect();
    await consumer.subscribe({ topic: 'notifications.broadcast' });

    console.log('Kafka consumer started');

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const notification = JSON.parse(message.value);
          await this.processBroadcast(notification);
        } catch (error) {
          console.error('Error processing message:', error);
          await this.sendToDeadLetterQueue(message, error);
        }
      }
    });
  }

  // Process broadcast notification
  async processBroadcast(notification, retryCount = 0) {
    const maxRetries = 3;
    const backoffMs = Math.pow(2, retryCount) * 1000;

    try {
      console.log(`Processing notification: ${notification.notificationId}`);

      const batchSize = 1000;
      let offset = 0;
      let totalProcessed = 0;

      while (true) {
        const users = await this.getUsersBatch(offset, batchSize);

        if (users.length === 0) {
          break;
        }

        // Process batch in parallel
        const results = await Promise.allSettled(
          users.map(user =>
            this.sendNotificationWithRetry(notification, user)
          )
        );

        // Count successes and failures
        const successes = results.filter(r => r.status === 'fulfilled').length;
        const failures = results.filter(r => r.status === 'rejected').length;

        totalProcessed += users.length;

        console.log(
          `Batch processed: ${successes} sent, ${failures} failed (Total: ${totalProcessed})`
        );

        offset += batchSize;
      }

      // Mark as processed
      await this.markNotificationProcessed(notification.notificationId);

      console.log(`Notification ${notification.notificationId} completed`);

    } catch (error) {
      if (retryCount < maxRetries) {
        console.log(`Retrying notification (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.processBroadcast(notification, retryCount + 1);
      } else {
        console.error(`Failed to process notification after ${maxRetries} retries`);
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
        body: notification.message,
        html: this.generateEmailHTML(notification)
      });

      // Log delivery success
      await this.logDelivery({
        notificationId: notification.notificationId,
        userId: user.id,
        channel: 'email',
        status: 'sent',
        retryCount
      });

    } catch (error) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.sendNotificationWithRetry(notification, user, retryCount + 1);
      } else {
        // Log failure
        await this.logDelivery({
          notificationId: notification.notificationId,
          userId: user.id,
          channel: 'email',
          status: 'failed',
          error: error.message,
          retryCount
        });

        throw error;
      }
    }
  }

  // Helper methods
  async getUsersBatch(offset, limit) {
    const result = await this.db.query(
      'SELECT id, email FROM users WHERE deleted_at IS NULL LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  async markNotificationProcessed(notificationId) {
    await this.db.query(
      'UPDATE notifications SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processed', notificationId]
    );
  }

  async logDelivery(data) {
    const query = `
      INSERT INTO notification_delivery_log 
      (notification_id, recipient_id, channel, status, last_error, retry_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (notification_id, recipient_id) 
      DO UPDATE SET 
        status = $4,
        last_error = $5,
        retry_count = $6,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      data.notificationId,
      data.userId,
      data.channel,
      data.status,
      data.error || null,
      data.retryCount || 0
    ]);
  }

  async sendToDeadLetterQueue(message, error) {
    const producer = this.kafka.producer();
    await producer.connect();

    await producer.send({
      topic: 'notifications.broadcast.dlq',
      messages: [{
        value: JSON.stringify({
          originalMessage: message,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        })
      }]
    });

    await producer.disconnect();
  }

  generateEmailHTML(notification) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; border-radius: 5px; }
            .content { padding: 20px; background-color: #f9f9f9; margin-top: 20px; }
            .footer { margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${notification.title}</h2>
            </div>
            <div class="content">
              <p>${notification.message}</p>
            </div>
            <div class="footer">
              <p>This is an automated notification. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  async close() {
    await this.db.end();
  }
}

module.exports = NotificationConsumer;
