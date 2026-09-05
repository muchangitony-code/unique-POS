import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Run one-time data migrations at server startup.
 * Each migration is idempotent — it checks the data_migrations table
 * before running, so it executes at most once per database instance.
 */
export async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure the tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_migrations (
        id        SERIAL PRIMARY KEY,
        name      TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Ensure the audit log table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          SERIAL PRIMARY KEY,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id    INTEGER,
        actor_name  TEXT,
        actor_role  TEXT,
        ip_address  TEXT,
        action      TEXT NOT NULL,
        entity_type TEXT,
        entity_id   TEXT,
        description TEXT NOT NULL,
        metadata    JSONB
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON audit_log (actor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action)`);

    // Add SMTP / backup-notification columns (idempotent)
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS smtp_host TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS smtp_user TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS smtp_from TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS backup_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS backup_success_notify BOOLEAN NOT NULL DEFAULT FALSE`);

    // Security alert rule engine columns
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS security_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS alert_rules JSONB`);

    // Movement types for opening stock and sale returns (autocommit — ALTER TYPE
    // ADD VALUE cannot run inside a transaction block).
    await client.query(`ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'opening'`);
    await client.query(`ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'return'`);

    // Customer/supplier payments ledger
    await client.query(`
      CREATE TABLE IF NOT EXISTS party_payments (
        id          SERIAL PRIMARY KEY,
        party_type  TEXT NOT NULL CHECK (party_type IN ('customer','supplier')),
        party_id    INTEGER NOT NULL,
        branch_id   INTEGER,
        amount      NUMERIC(15,2) NOT NULL,
        method      TEXT NOT NULL DEFAULT 'cash',
        reference   TEXT,
        notes       TEXT,
        created_by  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS party_payments_party_idx ON party_payments (party_type, party_id)`);

    // POS sale returns
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_returns (
        id            SERIAL PRIMARY KEY,
        return_number TEXT NOT NULL UNIQUE,
        sale_id       INTEGER NOT NULL,
        branch_id     INTEGER NOT NULL,
        total         NUMERIC(15,2) NOT NULL DEFAULT 0,
        refund_method TEXT NOT NULL DEFAULT 'cash',
        reason        TEXT,
        created_by    TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_return_items (
        id           SERIAL PRIMARY KEY,
        return_id    INTEGER NOT NULL,
        sale_item_id INTEGER NOT NULL,
        product_id   INTEGER NOT NULL,
        quantity     INTEGER NOT NULL,
        unit_price   NUMERIC(15,2) NOT NULL,
        total        NUMERIC(15,2) NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS sale_returns_sale_idx ON sale_returns (sale_id)`);

    // Payment settings columns (idempotent) — shown on documents & PDF exports
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS mpesa_paybill TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS mpesa_paybill_account TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS mpesa_till TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS mpesa_buy_goods TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS bank_name TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS bank_branch TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS bank_account_name TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS bank_account_number TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS bank_swift_code TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS other_payment_methods TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS payment_instructions TEXT`);

    // Branding fonts (idempotent)
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS body_font TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS heading_font TEXT`);

    // Security policy / session settings (idempotent)
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER NOT NULL DEFAULT 10080`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS password_min_length INTEGER NOT NULL DEFAULT 8`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS password_require_uppercase BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS password_require_number BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS password_require_symbol BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS max_failed_logins INTEGER NOT NULL DEFAULT 5`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS lockout_minutes INTEGER NOT NULL DEFAULT 15`);

    // Per-user security columns: 2FA (TOTP) + brute-force lockout tracking
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);

    // Login history — records every sign-in attempt (success or failure)
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_history (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER,
        email      TEXT NOT NULL,
        success    BOOLEAN NOT NULL,
        reason     TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS login_history_created_at_idx ON login_history (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS login_history_user_id_idx ON login_history (user_id)`);

    // Company branding & document settings columns (idempotent) — shown on documents
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tagline TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS website TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS vat_number TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_phone2 TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS primary_color TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS stamp_url TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS signature_url TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS document_footer TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS warranty_text TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS return_policy TEXT`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS quotation_validity_days INTEGER`);
    await client.query(`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS invoice_payment_terms TEXT`);

    // Quotation / invoice wizard columns (idempotent)
    await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_time TEXT`);
    await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS warranty TEXT`);
    await client.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_terms TEXT`);
    await client.query(`ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS unit TEXT`);
    await client.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit TEXT`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS company TEXT`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person TEXT`);

    // Per-year sequential document numbering (QTN-YYYY-000001 / INV-YYYY-000001).
    // Composite PK + atomic upsert keeps numbers unique under concurrent creates.
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_sequences (
        doc_type    TEXT NOT NULL,
        year        INTEGER NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (doc_type, year)
      )
    `);

    // Admin notifications table (in-app security alerts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id           SERIAL PRIMARY KEY,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        title        TEXT NOT NULL,
        body         TEXT NOT NULL,
        severity     TEXT NOT NULL DEFAULT 'warning',
        rule_id      TEXT NOT NULL,
        audit_log_id INTEGER,
        metadata     JSONB,
        read_at      TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx ON admin_notifications (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS admin_notifications_read_at_idx ON admin_notifications (read_at) WHERE read_at IS NULL`);

    // ─── Multi-branch foundation ────────────────────────────────────────────
    // Branches directory. Each branch carries its own contact / payment / bank /
    // footer / logo fields (fall back to company-level business_settings).
    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id                  SERIAL PRIMARY KEY,
        name                TEXT NOT NULL,
        code                TEXT NOT NULL UNIQUE,
        address             TEXT,
        county              TEXT,
        phone               TEXT,
        phone2              TEXT,
        email               TEXT,
        manager             TEXT,
        kra_pin             TEXT,
        paybill_number      TEXT,
        paybill_account     TEXT,
        till_number         TEXT,
        bank_name           TEXT,
        bank_account_name   TEXT,
        bank_account_number TEXT,
        logo_url            TEXT,
        receipt_footer      TEXT,
        invoice_footer      TEXT,
        quotation_footer    TEXT,
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Per-branch stock levels. Product catalog is shared; on-hand quantity and
    // reorder threshold live here (one row per branch+product).
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_stock (
        id            SERIAL PRIMARY KEY,
        branch_id     INTEGER NOT NULL,
        product_id    INTEGER NOT NULL,
        current_stock INTEGER NOT NULL DEFAULT 0,
        min_stock     INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT product_stock_branch_product_unique UNIQUE (branch_id, product_id)
      )
    `);

    // Cross-branch stock transfers with an approval workflow.
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id                    SERIAL PRIMARY KEY,
        transfer_number       TEXT NOT NULL,
        source_branch_id      INTEGER NOT NULL,
        destination_branch_id INTEGER NOT NULL,
        product_id            INTEGER NOT NULL,
        quantity              INTEGER NOT NULL,
        status                TEXT NOT NULL DEFAULT 'pending',
        notes                 TEXT,
        transfer_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        initiated_by_id       INTEGER,
        initiated_by_name     TEXT,
        decided_by_id         INTEGER,
        decided_by_name       TEXT,
        decided_at            TIMESTAMPTZ,
        decision_notes        TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON stock_transfers (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS stock_transfers_source_idx ON stock_transfers (source_branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS stock_transfers_dest_idx ON stock_transfers (destination_branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS stock_transfers_created_at_idx ON stock_transfers (created_at DESC)`);

    // Add branch_id to every branch-scoped table (nullable first; backfilled and
    // made NOT NULL by the seed migration below).
    for (const table of [
      "users", "customers", "suppliers", "quotations", "invoices",
      "purchases", "expenses", "sales", "stock_movements", "audit_log",
    ]) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
      await client.query(`CREATE INDEX IF NOT EXISTS ${table}_branch_id_idx ON ${table} (branch_id)`);
    }

    await runOnce(
      () => client.query("SELECT 1 FROM data_migrations WHERE name = $1", ["wipe-demo-transactional-data-2026-07-04"]),
      () => client.query("INSERT INTO data_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", ["wipe-demo-transactional-data-2026-07-04"]),
      "wipe-demo-transactional-data-2026-07-04",
      async () => {
        logger.info("Running migration: wipe-demo-transactional-data-2026-07-04");
        await client.query(`
          TRUNCATE
            sale_items,
            invoice_items,
            invoice_payments,
            quotation_items,
            purchase_items,
            sales,
            invoices,
            quotations,
            purchases,
            expenses,
            stock_movements
          RESTART IDENTITY CASCADE
        `);
        logger.info("Migration complete: all demo transactional data cleared, sequences reset.");
      }
    );

    await runOnce(
      () => client.query("SELECT 1 FROM data_migrations WHERE name = $1", ["seed-main-branch-and-backfill-2026-07-05"]),
      () => client.query("INSERT INTO data_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", ["seed-main-branch-and-backfill-2026-07-05"]),
      "seed-main-branch-and-backfill-2026-07-05",
      async () => {
        logger.info("Running migration: seed-main-branch-and-backfill-2026-07-05");

        // 1. Create the default Main Branch (idempotent on code).
        await client.query(
          `INSERT INTO branches (name, code, is_active) VALUES ('Main Branch', 'MAIN', TRUE) ON CONFLICT (code) DO NOTHING`
        );
        const { rows } = await client.query<{ id: number }>("SELECT id FROM branches WHERE code = 'MAIN'");
        const mainId = rows[0]?.id;
        if (!mainId) throw new Error("Failed to resolve Main Branch id during migration");

        // 2. Seed the Main Branch's payment/contact fields from company-level
        //    business_settings so existing documents keep the same details.
        await client.query(
          `UPDATE branches b SET
             phone               = COALESCE(b.phone, s.business_phone),
             email               = COALESCE(b.email, s.business_email),
             kra_pin             = COALESCE(b.kra_pin, s.vat_number),
             paybill_number      = COALESCE(b.paybill_number, s.mpesa_paybill),
             paybill_account     = COALESCE(b.paybill_account, s.mpesa_paybill_account),
             till_number         = COALESCE(b.till_number, s.mpesa_till),
             bank_name           = COALESCE(b.bank_name, s.bank_name),
             bank_account_name   = COALESCE(b.bank_account_name, s.bank_account_name),
             bank_account_number = COALESCE(b.bank_account_number, s.bank_account_number),
             logo_url            = COALESCE(b.logo_url, s.logo_url)
           FROM (SELECT * FROM business_settings LIMIT 1) s
           WHERE b.id = $1`,
          [mainId]
        );

        // 3. Assign every existing row to the Main Branch.
        for (const table of [
          "users", "customers", "suppliers", "quotations", "invoices",
          "purchases", "expenses", "sales", "stock_movements", "audit_log",
        ]) {
          await client.query(`UPDATE ${table} SET branch_id = $1 WHERE branch_id IS NULL`, [mainId]);
        }

        // 4. Backfill per-branch stock from the global product stock levels.
        await client.query(
          `INSERT INTO product_stock (branch_id, product_id, current_stock, min_stock)
           SELECT $1, id, current_stock, min_stock FROM products
           ON CONFLICT (branch_id, product_id) DO NOTHING`,
          [mainId]
        );

        // 5. Enforce branch_id on transactional tables now that they are backfilled.
        //    users and audit_log stay nullable (system events / unassigned users).
        for (const table of [
          "customers", "suppliers", "quotations", "invoices",
          "purchases", "expenses", "sales", "stock_movements",
        ]) {
          await client.query(`ALTER TABLE ${table} ALTER COLUMN branch_id SET NOT NULL`);
        }

        logger.info("Migration complete: Main Branch created, all data assigned, per-branch stock backfilled.");
      }
    );
  } finally {
    client.release();
  }
}

async function runOnce(
  checkFn: () => Promise<{ rows: unknown[] }>,
  markFn: () => Promise<unknown>,
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const { rows } = await checkFn();
  if (rows.length > 0) {
    logger.info({ migration: name }, "Migration already applied — skipping");
    return;
  }
  await fn();
  await markFn();
}
