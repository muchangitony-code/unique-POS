-- Add wholesale_price column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(15,4) DEFAULT 0;
