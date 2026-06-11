-- Add commission_paid field to orders table
-- This field tracks whether the commission has been paid for an order

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for filtering by commission_paid status
CREATE INDEX IF NOT EXISTS orders_commission_paid_idx 
ON orders(commission_paid);
