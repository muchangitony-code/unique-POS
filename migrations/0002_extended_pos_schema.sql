BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS customer_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_group_id INTEGER REFERENCES customer_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS customers_customer_group_id_idx ON customers (customer_group_id);

CREATE TABLE IF NOT EXISTS product_units (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_unit_id INTEGER REFERENCES product_units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_product_unit_id_idx ON products (product_unit_id);

CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, product_id)
);
CREATE INDEX IF NOT EXISTS stock_branch_id_idx ON stock (branch_id);
CREATE INDEX IF NOT EXISTS stock_product_id_idx ON stock (product_id);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  adjusted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_adjustments_branch_id_idx ON stock_adjustments (branch_id);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_id_idx ON stock_adjustments (product_id);

CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL,
  reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (invoice_id IS NOT NULL OR sale_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS payments_branch_id_idx ON payments (branch_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS payments_sale_id_idx ON payments (sale_id);

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_expense_category_id_idx ON expenses (expense_category_id);

CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  return_number TEXT NOT NULL UNIQUE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS returns_branch_id_idx ON returns (branch_id);

CREATE TABLE IF NOT EXISTS return_items (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS return_items_return_id_idx ON return_items (return_id);

CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  transfer_number TEXT NOT NULL UNIQUE,
  source_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  destination_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_branch_id <> destination_branch_id)
);
CREATE INDEX IF NOT EXISTS transfers_source_branch_id_idx ON transfers (source_branch_id);
CREATE INDEX IF NOT EXISTS transfers_destination_branch_id_idx ON transfers (destination_branch_id);

CREATE TABLE IF NOT EXISTS transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transfer_id, product_id)
);
CREATE INDEX IF NOT EXISTS transfer_items_transfer_id_idx ON transfer_items (transfer_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT NOT NULL,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_branch_id_idx ON audit_logs (branch_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_rates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'percentage',
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barcode_labels (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  printed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS barcode_labels_product_id_idx ON barcode_labels (product_id);

CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  issued_to TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sale_id IS NOT NULL OR invoice_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS receipts_sale_id_idx ON receipts (sale_id);
CREATE INDEX IF NOT EXISTS receipts_invoice_id_idx ON receipts (invoice_id);

CREATE TABLE IF NOT EXISTS currencies (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx ON notifications (read_at);

INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Full system access'),
  ('business_owner', 'Owner-level access'),
  ('branch_manager', 'Branch management access'),
  ('cashier', 'POS checkout access'),
  ('storekeeper', 'Inventory operations'),
  ('accountant', 'Finance operations'),
  ('sales_rep', 'Sales operations'),
  ('technician', 'Service operations')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (key, description) VALUES
  ('dashboard.view', 'View dashboard'),
  ('sales.manage', 'Create and manage sales'),
  ('products.manage', 'Create and manage products'),
  ('inventory.manage', 'Adjust and transfer stock'),
  ('purchases.manage', 'Create and manage purchases'),
  ('reports.view', 'View reports'),
  ('users.manage', 'Manage users and roles')
ON CONFLICT (key) DO NOTHING;

INSERT INTO customer_groups (name, discount_percent) VALUES
  ('Retail', 0),
  ('Wholesale', 5),
  ('VIP', 10)
ON CONFLICT (name) DO NOTHING;

INSERT INTO product_units (name, symbol) VALUES
  ('Piece', 'pc'),
  ('Box', 'box'),
  ('Kilogram', 'kg'),
  ('Litre', 'l')
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO payment_methods (code, name) VALUES
  ('cash', 'Cash'),
  ('mpesa', 'M-Pesa'),
  ('bank_transfer', 'Bank Transfer'),
  ('card', 'Card'),
  ('credit', 'Credit'),
  ('split', 'Split Payment')
ON CONFLICT (code) DO NOTHING;

INSERT INTO expense_categories (name) VALUES
  ('Utilities'),
  ('Rent'),
  ('Salaries'),
  ('Transport'),
  ('Miscellaneous')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tax_rates (name, rate, is_default) VALUES
  ('VAT 16%', 16.0000, TRUE),
  ('Zero Rated', 0.0000, FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO currencies (code, symbol, name, is_default) VALUES
  ('KES', 'KES', 'Kenyan Shilling', TRUE),
  ('USD', '$', 'US Dollar', FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('app.name', '"UniquePOS"'::jsonb),
  ('app.version', '"1.0.0"'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
