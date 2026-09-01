'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { parseAndValidateDatabaseUrl, railwaySsl } = require('../scripts/database-url.cjs');

async function executeAuthoritativeStockRecovery() {
  const sqlPath = path.join(__dirname, '..', 'migrations', '0029_restore_main_branch_opening_stock.sql');
  if (!fs.existsSync(sqlPath)) return { executed: false, reason: 'recovery-file-missing' };
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const { databaseUrl } = parseAndValidateDatabaseUrl('authoritative-stock-recovery');
  const pool = new Pool({ connectionString: databaseUrl, ssl: railwaySsl(databaseUrl), max: 1 });
  try {
    const before = await pool.query(`SELECT COALESCE(SUM(quantity_on_hand),0)::numeric AS units FROM inventory_stock_v2`);
    await pool.query(sql);
    const after = await pool.query(`SELECT COUNT(*) FILTER (WHERE quantity_on_hand>0)::int AS positive_lines, COALESCE(SUM(quantity_on_hand),0)::numeric AS units FROM inventory_stock_v2`);
    return {
      executed: true,
      unitsBefore: Number(before.rows[0].units || 0),
      unitsAfter: Number(after.rows[0].units || 0),
      positiveLines: Number(after.rows[0].positive_lines || 0)
    };
  } finally {
    await pool.end();
  }
}

module.exports = { executeAuthoritativeStockRecovery };
