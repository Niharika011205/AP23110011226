-- Database Initialization Script for Notification System

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('placement', 'result', 'event')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  is_read BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id 
ON notifications(recipient_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_isread 
ON notifications(recipient_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created 
ON notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type 
ON notifications(type);

CREATE INDEX IF NOT EXISTS idx_notifications_priority 
ON notifications(priority);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
ON notifications(created_at DESC);

-- Composite index for common query
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_isread_created 
ON notifications(recipient_id, is_read, created_at DESC);

-- Composite index for placement notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_created 
ON notifications(recipient_id, type, created_at DESC);

-- Create notification read status table
CREATE TABLE IF NOT EXISTS notification_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_id VARCHAR(50) NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_id, recipient_id)
);

-- Create notification delivery log table
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_id VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  retry_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_id, recipient_id, channel)
);

-- Create indexes for delivery log
CREATE INDEX IF NOT EXISTS idx_delivery_log_status 
ON notification_delivery_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_log_notification 
ON notification_delivery_log(notification_id);

CREATE INDEX IF NOT EXISTS idx_delivery_log_recipient 
ON notification_delivery_log(recipient_id);

-- Create users table (for reference)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Create index on users
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for notifications table
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for delivery log table
DROP TRIGGER IF EXISTS update_delivery_log_updated_at ON notification_delivery_log;
CREATE TRIGGER update_delivery_log_updated_at
BEFORE UPDATE ON notification_delivery_log
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create view for unread notifications count
CREATE OR REPLACE VIEW unread_notifications_count AS
SELECT 
  recipient_id,
  COUNT(*) as unread_count,
  MAX(created_at) as latest_notification
FROM notifications
WHERE is_read = false AND deleted_at IS NULL
GROUP BY recipient_id;

-- Create view for notification statistics
CREATE OR REPLACE VIEW notification_statistics AS
SELECT 
  recipient_id,
  type,
  COUNT(*) as total_count,
  SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread_count,
  MAX(created_at) as latest_notification
FROM notifications
WHERE deleted_at IS NULL
GROUP BY recipient_id, type;

-- Sample data for testing
INSERT INTO users (id, email, name, role) VALUES
  ('user_123', 'student@example.com', 'John Doe', 'user'),
  ('user_456', 'admin@example.com', 'Admin User', 'admin')
ON CONFLICT DO NOTHING;

-- Insert sample notifications
INSERT INTO notifications (recipient_id, type, title, message, priority, is_read) VALUES
  ('user_123', 'placement', 'Amazon Hiring Drive', 'Amazon is conducting a hiring drive. Register now!', 'high', false),
  ('user_123', 'result', 'Exam Results Published', 'Your exam results are now available', 'medium', false),
  ('user_123', 'event', 'Tech Talk Tomorrow', 'Join us for a tech talk on AI/ML', 'low', true)
ON CONFLICT DO NOTHING;
