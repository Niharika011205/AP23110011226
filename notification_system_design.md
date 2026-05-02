# Notification System Microservice - Design & Implementation

## Stage 1: REST API Design

### Endpoints Overview

#### 1. Create Notification
```
POST /api/v1/notifications
Content-Type: application/json
Authorization: Bearer {token}

Request Body:
{
  "recipientId": "user_123",
  "type": "placement|result|event",
  "title": "Placement Drive",
  "message": "Amazon is hiring",
  "metadata": {
    "companyId": "amazon_001",
    "driveId": "drive_456"
  },
  "priority": "high|medium|low"
}

Response (201 Created):
{
  "id": "notif_789",
  "recipientId": "user_123",
  "type": "placement",
  "title": "Placement Drive",
  "message": "Amazon is hiring",
  "priority": "high",
  "isRead": false,
  "createdAt": "2026-05-02T10:30:00Z",
  "updatedAt": "2026-05-02T10:30:00Z"
}
```

#### 2. Get Notifications
```
GET /api/v1/notifications?page=1&limit=20&isRead=false&type=placement
Authorization: Bearer {token}

Response (200 OK):
{
  "data": [
    {
      "id": "notif_789",
      "recipientId": "user_123",
      "type": "placement",
      "title": "Placement Drive",
      "message": "Amazon is hiring",
      "priority": "high",
      "isRead": false,
      "createdAt": "2026-05-02T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

#### 3. Mark as Read
```
PATCH /api/v1/notifications/{notificationId}/read
Authorization: Bearer {token}

Request Body:
{
  "isRead": true
}

Response (200 OK):
{
  "id": "notif_789",
  "isRead": true,
  "updatedAt": "2026-05-02T10:35:00Z"
}
```

#### 4. Delete Notification
```
DELETE /api/v1/notifications/{notificationId}
Authorization: Bearer {token}

Response (204 No Content)
```

#### 5. Mark All as Read
```
PATCH /api/v1/notifications/read-all
Authorization: Bearer {token}

Response (200 OK):
{
  "updatedCount": 45
}
```

### Real-Time Notification Mechanism

#### WebSocket Implementation
```
Connection: ws://api.example.com/ws/notifications?token={token}

Server sends on new notification:
{
  "type": "notification_created",
  "data": {
    "id": "notif_789",
    "recipientId": "user_123",
    "title": "Placement Drive",
    "message": "Amazon is hiring",
    "priority": "high",
    "createdAt": "2026-05-02T10:30:00Z"
  }
}

Client sends heartbeat every 30s:
{
  "type": "ping"
}

Server responds:
{
  "type": "pong"
}
```

#### Server-Sent Events (SSE) Alternative
```
GET /api/v1/notifications/stream
Authorization: Bearer {token}

Response (text/event-stream):
data: {"type":"notification_created","data":{...}}

data: {"type":"notification_read","data":{"id":"notif_789"}}
```

**Recommendation**: Use WebSocket for bi-directional communication and better performance. Use SSE for simpler, unidirectional scenarios.

---

## Stage 2: Database Design

### Database Choice: PostgreSQL

**Why PostgreSQL?**
- ACID compliance ensures data consistency for critical notifications
- Excellent indexing capabilities for query optimization
- JSON support for flexible metadata storage
- Proven scalability with proper partitioning
- Strong consistency model suitable for financial/placement notifications
- Better for relational data (users, notifications, read status)

### Schema Design

```sql
-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('placement', 'result', 'event')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Indexes for Performance
CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX idx_notifications_recipient_isread ON notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_recipient_created ON notifications(recipient_id, created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_priority ON notifications(priority);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Composite Index for Common Query
CREATE INDEX idx_notifications_recipient_isread_created 
ON notifications(recipient_id, is_read, created_at DESC);

-- Notification Read Status Table (for audit trail)
CREATE TABLE notification_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_id VARCHAR(50) NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_id, recipient_id)
);

-- Notification Delivery Log (for retry mechanism)
CREATE TABLE notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_id VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  retry_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_delivery_log_status ON notification_delivery_log(status, created_at DESC);
```

### Scalability Issues & Solutions

| Issue | Solution |
|-------|----------|
| Table grows too large | Implement table partitioning by date (monthly/quarterly) |
| Slow reads for old data | Archive notifications older than 1 year to separate table |
| High write throughput | Use connection pooling (PgBouncer), write replicas |
| Uneven data distribution | Partition by recipient_id hash for distributed systems |
| Slow full-text search | Add PostgreSQL full-text search indexes or use Elasticsearch |
| Real-time requirements | Implement Redis cache layer for hot data |

### Partitioning Strategy
```sql
-- Partition by date
CREATE TABLE notifications_2026_q1 PARTITION OF notifications
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

CREATE TABLE notifications_2026_q2 PARTITION OF notifications
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
```

---

## Stage 3: Query Optimization

### Original Query Analysis
```sql
SELECT * FROM notifications 
WHERE studentId = 1042 
AND isRead = false 
ORDER BY createdAt DESC;
```

**Why It's Slow:**
1. `SELECT *` fetches unnecessary columns (metadata, deleted_at, etc.)
2. No index on `(studentId, isRead, createdAt)` combination
3. Full table scan if indexes don't exist
4. Sorting on large result set without index support
5. No pagination - could return thousands of rows

### Indexing Strategy

```sql
-- Primary Index (Most Important)
CREATE INDEX idx_notifications_recipient_isread_created 
ON notifications(recipient_id, is_read, createdAt DESC);

-- Why This Index Works:
-- 1. Filters by recipient_id (first condition)
-- 2. Filters by is_read (second condition)
-- 3. Provides pre-sorted results by createdAt (ORDER BY)
-- 4. Composite index is more efficient than separate indexes

-- Why NOT Index All Columns:
-- - Increases storage overhead
-- - Slows down INSERT/UPDATE/DELETE operations
-- - Query planner gets confused with too many options
-- - Maintenance overhead during vacuuming
-- - Only index columns used in WHERE, JOIN, ORDER BY, GROUP BY
```

### Optimized Queries

```sql
-- Query 1: Optimized with Pagination
SELECT 
  id, 
  recipient_id, 
  type, 
  title, 
  message, 
  priority, 
  is_read, 
  created_at
FROM notifications 
WHERE recipient_id = 1042 
  AND is_read = false 
ORDER BY created_at DESC 
LIMIT 20 OFFSET 0;

-- Query 2: Placement Notifications from Last 7 Days
SELECT 
  id, 
  recipient_id, 
  type, 
  title, 
  message, 
  priority, 
  created_at
FROM notifications 
WHERE recipient_id = 1042 
  AND type = 'placement'
  AND created_at >= NOW() - INTERVAL '7 days'
  AND deleted_at IS NULL
ORDER BY created_at DESC 
LIMIT 50;

-- Index for Query 2:
CREATE INDEX idx_notifications_recipient_type_created 
ON notifications(recipient_id, type, created_at DESC);

-- Query 3: Count Unread Notifications (Fast)
SELECT COUNT(*) as unread_count
FROM notifications 
WHERE recipient_id = 1042 
  AND is_read = false;

-- Query 4: Get Notifications with Pagination and Filters
SELECT 
  id, 
  recipient_id, 
  type, 
  title, 
  priority, 
  is_read, 
  created_at
FROM notifications 
WHERE recipient_id = 1042 
  AND is_read = $1
  AND type = $2
  AND created_at >= $3
ORDER BY created_at DESC 
LIMIT $4 OFFSET $5;
```

### Query Execution Plan
```
-- Check execution plan
EXPLAIN ANALYZE
SELECT * FROM notifications 
WHERE recipient_id = 1042 
  AND is_read = false 
ORDER BY created_at DESC 
LIMIT 20;

-- Expected output with index:
-- Index Scan using idx_notifications_recipient_isread_created
-- Index Cond: (recipient_id = 1042) AND (is_read = false)
-- Rows: 20
```

---

## Stage 4: Performance Improvements

### Problem: Fetching Notifications on Every Page Load

**Why It's Inefficient:**
- Database hit on every page load (100+ requests/second = bottleneck)
- Network latency for each request
- Redundant data transfer
- Increased database connection pool pressure
- Poor user experience with slow page loads

### Solution 1: Caching with Redis

```javascript
// Cache unread notification count
const cacheKey = `notifications:unread:${userId}`;
const cachedCount = await redis.get(cacheKey);

if (cachedCount) {
  return JSON.parse(cachedCount);
}

const count = await db.query(
  'SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND is_read = false',
  [userId]
);

await redis.setex(cacheKey, 300, JSON.stringify(count)); // 5 min TTL
return count;
```

**Trade-offs:**
- ✅ Reduces database load by 80-90%
- ✅ Sub-millisecond response times
- ❌ Eventual consistency (5-min stale data)
- ❌ Additional infrastructure (Redis)
- ❌ Cache invalidation complexity

### Solution 2: Pagination

```javascript
// Fetch only 20 notifications per page
GET /api/v1/notifications?page=1&limit=20

// Benefits:
// - Reduces data transfer by 90%
// - Faster initial page load
// - Better UX with lazy loading
```

**Trade-offs:**
- ✅ Reduces bandwidth and database load
- ✅ Faster initial load
- ❌ Requires multiple requests for all data
- ❌ User must click "Load More"

### Solution 3: Lazy Loading with WebSocket

```javascript
// Initial load: fetch only unread count
GET /api/v1/notifications/count

// Connect to WebSocket for real-time updates
ws://api.example.com/ws/notifications

// Fetch full list only when user clicks notification bell
GET /api/v1/notifications?limit=20
```

**Trade-offs:**
- ✅ Minimal initial load
- ✅ Real-time updates
- ✅ Better UX
- ❌ Requires WebSocket infrastructure
- ❌ More complex client-side logic

### Solution 4: Server-Side Aggregation

```javascript
// Fetch pre-aggregated data
SELECT 
  type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM notifications 
WHERE recipient_id = $1 AND is_read = false
GROUP BY type;

// Response:
{
  "placement": { "count": 5, "latest": "2026-05-02T10:30:00Z" },
  "result": { "count": 2, "latest": "2026-05-02T09:15:00Z" },
  "event": { "count": 8, "latest": "2026-05-02T08:00:00Z" }
}
```

**Trade-offs:**
- ✅ Minimal data transfer
- ✅ Fast aggregation with indexes
- ❌ Less detailed information
- ❌ Requires separate query

### Recommended Approach: Hybrid Strategy

1. **Cache unread count** (Redis, 5-min TTL)
2. **Paginate full list** (20 items per page)
3. **WebSocket for real-time** (new notifications)
4. **Lazy load details** (on demand)

---

## Stage 5: System Design for Notify All

### Original Pseudocode Problem

```pseudocode
function notifyAll(message) {
  users = getAllUsers()
  for each user in users:
    notification = createNotification(user, message)
    sendEmail(user.email, message)
    updateDatabase(notification)
}
```

**Issues:**
1. **Scalability**: Linear time complexity O(n) - 1M users = 1M sequential operations
2. **Failure Handling**: If email fails at user 500K, remaining users don't get notified
3. **No Retry Logic**: Failed emails are lost permanently
4. **Blocking Operations**: Entire process blocks until completion
5. **Database Bottleneck**: Sequential writes to database
6. **Memory Issues**: Loading all users into memory
7. **No Monitoring**: Can't track progress or failures

### Improved System Design with Kafka

```
┌─────────────────────────────────────────────────────────────┐
│                    Notify All Service                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Kafka Topic:    │
                    │  notifications   │
                    └──────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
        ┌────────────┐ ┌────────────┐ ┌────────────┐
        │ Consumer 1 │ │ Consumer 2 │ │ Consumer 3 │
        │ (Email)    │ │ (SMS)      │ │ (Push)     │
        └────────────┘ └────────────┘ └────────────┘
                │             │             │
                ▼             ▼             ▼
        ┌────────────┐ ┌────────────┐ ┌────────────┐
        │ Email      │ │ SMS        │ │ Push       │
        │ Service    │ │ Service    │ │ Service    │
        └────────────┘ └────────────┘ └────────────┘
                │             │             │
                └─────────────┼─────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Dead Letter     │
                    │  Queue (DLQ)     │
                    └──────────────────┘
```

### Improved Pseudocode with Async Processing

```javascript
// Step 1: Create notification and publish to Kafka
async function notifyAll(message) {
  const notification = await createNotification({
    type: 'broadcast',
    title: message.title,
    message: message.content,
    priority: 'high'
  });

  // Publish to Kafka topic
  await kafkaProducer.send({
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

// Step 2: Kafka Consumer - Process notifications
const consumer = kafka.consumer({ groupId: 'notification-processors' });

consumer.subscribe({ topic: 'notifications.broadcast' });

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const notification = JSON.parse(message.value);
    
    try {
      // Fetch users in batches (avoid memory issues)
      const batchSize = 1000;
      let offset = 0;
      
      while (true) {
        const users = await getUsersBatch(offset, batchSize);
        if (users.length === 0) break;
        
        // Process batch in parallel
        await Promise.all(
          users.map(user => 
            processNotificationWithRetry(notification, user)
          )
        );
        
        offset += batchSize;
      }
      
      // Mark as processed
      await markNotificationProcessed(notification.notificationId);
      
    } catch (error) {
      // Send to Dead Letter Queue for manual review
      await sendToDeadLetterQueue(message, error);
      throw error; // Kafka will retry
    }
  }
});

// Step 3: Process with Retry Logic
async function processNotificationWithRetry(notification, user, retryCount = 0) {
  const maxRetries = 3;
  const backoffMs = Math.pow(2, retryCount) * 1000; // Exponential backoff
  
  try {
    // Send email
    await emailService.send({
      to: user.email,
      subject: notification.title,
      body: notification.message
    });
    
    // Log delivery
    await logDelivery({
      notificationId: notification.notificationId,
      userId: user.id,
      channel: 'email',
      status: 'sent',
      timestamp: Date.now()
    });
    
  } catch (error) {
    if (retryCount < maxRetries) {
      // Retry with exponential backoff
      await sleep(backoffMs);
      return processNotificationWithRetry(notification, user, retryCount + 1);
    } else {
      // Log failure
      await logDelivery({
        notificationId: notification.notificationId,
        userId: user.id,
        channel: 'email',
        status: 'failed',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
}

// Step 4: Dead Letter Queue Handler
async function processDLQ() {
  const dlqConsumer = kafka.consumer({ groupId: 'dlq-processor' });
  
  dlqConsumer.subscribe({ topic: 'notifications.broadcast.dlq' });
  
  await dlqConsumer.run({
    eachMessage: async ({ message }) => {
      // Log for manual review
      console.error('DLQ Message:', message);
      
      // Alert ops team
      await alertOpsTeam({
        severity: 'high',
        message: 'Notification delivery failed after retries',
        data: message
      });
    }
  });
}
```

### Database vs Email Operations: Decoupled Design

**Why Decouple?**

```
❌ COUPLED (Bad):
User Request → Create Notification → Send Email → Return Response
                                    ↑
                            If email fails, entire operation fails

✅ DECOUPLED (Good):
User Request → Create Notification → Queue Message → Return Response
                                                    ↓
                                            Async Email Service
                                            (Independent failure handling)
```

**Benefits of Decoupling:**
- Database write succeeds even if email fails
- Email service can be scaled independently
- Retry logic doesn't block user request
- Better fault isolation
- Easier to add new channels (SMS, push)

**Implementation:**
```javascript
// Decoupled approach
async function notifyAll(message) {
  // Step 1: Write to database (fast, reliable)
  const notification = await db.notifications.create({
    type: 'broadcast',
    title: message.title,
    message: message.content,
    status: 'pending'
  });

  // Step 2: Queue for async processing (fire and forget)
  await queue.enqueue({
    type: 'send_notification',
    notificationId: notification.id,
    channels: ['email', 'sms', 'push']
  });

  // Step 3: Return immediately
  return { notificationId: notification.id, status: 'queued' };
}

// Separate async worker
async function notificationWorker() {
  while (true) {
    const job = await queue.dequeue();
    
    try {
      await sendNotificationToAllChannels(job);
      await job.complete();
    } catch (error) {
      await job.retry(error);
    }
  }
}
```

---

## Stage 6: Priority Inbox Implementation

### Priority Logic

```javascript
// Priority scoring system
const PRIORITY_SCORES = {
  'placement': 100,
  'result': 50,
  'event': 10
};

const RECENCY_WEIGHT = 0.2; // 20% weight for recency
const TYPE_WEIGHT = 0.8;    // 80% weight for type

function calculatePriority(notification) {
  const typeScore = PRIORITY_SCORES[notification.type] || 0;
  
  // Recency score: newer = higher (0-100)
  const ageInHours = (Date.now() - notification.createdAt) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 100 - (ageInHours * 5)); // Decay over time
  
  // Combined score
  const totalScore = (typeScore * TYPE_WEIGHT) + (recencyScore * RECENCY_WEIGHT);
  
  return totalScore;
}
```

### Fetch Top 10 Important Notifications

```javascript
async function getTopNotifications(userId, limit = 10) {
  // Query: Get recent notifications with priority calculation
  const notifications = await db.query(`
    SELECT 
      id,
      recipient_id,
      type,
      title,
      message,
      priority,
      is_read,
      created_at,
      -- Calculate priority score
      CASE 
        WHEN type = 'placement' THEN 100
        WHEN type = 'result' THEN 50
        WHEN type = 'event' THEN 10
        ELSE 0
      END * 0.8 + 
      GREATEST(0, 100 - (EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 * 5)) * 0.2 
      AS priority_score
    FROM notifications
    WHERE recipient_id = $1
      AND deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY priority_score DESC, created_at DESC
    LIMIT $2
  `, [userId, limit]);

  return notifications;
}

// Alternative: Using application-level sorting
async function getTopNotificationsApp(userId, limit = 10) {
  // Fetch more than needed (to account for filtering)
  const notifications = await db.query(`
    SELECT 
      id, recipient_id, type, title, message, 
      priority, is_read, created_at
    FROM notifications
    WHERE recipient_id = $1
      AND deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit * 2]);

  // Calculate priority in application
  const scored = notifications.map(notif => ({
    ...notif,
    score: calculatePriority(notif)
  }));

  // Sort by score and return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

### Efficient Top 10 Maintenance with Incoming Notifications

```javascript
// Real-time priority inbox using Redis sorted set
class PriorityInbox {
  constructor(userId, redisClient) {
    this.userId = userId;
    this.redis = redisClient;
    this.key = `priority_inbox:${userId}`;
    this.maxSize = 10;
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

    // Set expiry (30 days)
    await this.redis.expire(this.key, 30 * 24 * 60 * 60);
  }

  // Get top 10
  async getTop10() {
    const items = await this.redis.zrevrange(
      this.key,
      0,
      this.maxSize - 1,
      'WITHSCORES'
    );

    return items.map((item, idx) => {
      if (idx % 2 === 0) {
        return {
          ...JSON.parse(item),
          score: items[idx + 1]
        };
      }
    }).filter(Boolean);
  }

  // Calculate priority score
  calculateScore(notification) {
    const typeScore = {
      'placement': 100,
      'result': 50,
      'event': 10
    }[notification.type] || 0;

    const ageInHours = (Date.now() - notification.createdAt) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - (ageInHours * 5));

    return (typeScore * 0.8) + (recencyScore * 0.2);
  }

  // Update on read
  async markAsRead(notificationId) {
    const items = await this.redis.zrange(this.key, 0, -1);
    
    for (const item of items) {
      const notif = JSON.parse(item);
      if (notif.id === notificationId) {
        notif.isRead = true;
        const score = this.calculateScore(notif);
        
        await this.redis.zadd(this.key, score, JSON.stringify(notif));
        break;
      }
    }
  }
}

// Usage
const inbox = new PriorityInbox(userId, redisClient);

// When new notification arrives
await inbox.addNotification({
  id: 'notif_123',
  type: 'placement',
  title: 'Amazon Hiring',
  message: 'Drive starts tomorrow',
  createdAt: Date.now(),
  isRead: false
});

// Get top 10
const topNotifications = await inbox.getTop10();
```

### Complete Implementation with WebSocket Integration

```javascript
// Server-side: Emit priority updates via WebSocket
io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;
  const inbox = new PriorityInbox(userId, redisClient);

  // Send initial top 10
  socket.on('get_priority_inbox', async () => {
    const top10 = await inbox.getTop10();
    socket.emit('priority_inbox_updated', top10);
  });

  // Listen for new notifications
  notificationBus.on(`notification:${userId}`, async (notification) => {
    await inbox.addNotification(notification);
    
    const top10 = await inbox.getTop10();
    socket.emit('priority_inbox_updated', top10);
  });

  // Handle mark as read
  socket.on('mark_read', async (notificationId) => {
    await inbox.markAsRead(notificationId);
    
    const top10 = await inbox.getTop10();
    socket.emit('priority_inbox_updated', top10);
  });
});

// Client-side
const socket = io('ws://api.example.com', {
  auth: { userId: currentUser.id }
});

socket.emit('get_priority_inbox');

socket.on('priority_inbox_updated', (notifications) => {
  renderPriorityInbox(notifications);
});

function markAsRead(notificationId) {
  socket.emit('mark_read', notificationId);
}
```

### Performance Characteristics

| Operation | Time Complexity | Space Complexity | Notes |
|-----------|-----------------|------------------|-------|
| Add notification | O(log n) | O(1) | Redis sorted set insertion |
| Get top 10 | O(log n + 10) | O(10) | Constant time for fixed size |
| Mark as read | O(n) | O(1) | Linear scan, but n=10 |
| Update score | O(log n) | O(1) | Re-insertion in sorted set |

**Why This Approach Works:**
- Maintains only top 10 in memory (bounded space)
- O(log n) insertion for new notifications
- O(1) retrieval of top 10
- Automatic expiry prevents stale data
- Real-time updates via WebSocket
- Scales to millions of users (each has own inbox)

---

## Summary

This notification system design provides:

1. **REST API**: Clear, RESTful endpoints with pagination and filtering
2. **Database**: PostgreSQL with strategic indexing for performance
3. **Query Optimization**: Composite indexes and optimized queries
4. **Performance**: Caching, pagination, lazy loading, and WebSocket integration
5. **Scalability**: Kafka-based async processing with retry logic
6. **Priority Inbox**: Efficient top-10 maintenance using Redis sorted sets

The system is production-ready, scalable to millions of users, and handles failures gracefully.
