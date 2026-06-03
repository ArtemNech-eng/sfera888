-- Add dispatch resend tracking to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dispatch_resend_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatch_resend_at TIMESTAMP;

-- Create dispatch resend logs table
CREATE TABLE IF NOT EXISTS dispatch_resend_logs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  resend_number INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'non_responders',
  recipient_count INTEGER NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  response_count INTEGER DEFAULT 0
);
