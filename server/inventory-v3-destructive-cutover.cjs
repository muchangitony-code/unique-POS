'use strict';
const { Pool }=require('pg');
const { parseAndValidateDatabaseUrl,railwaySsl }=require('../scripts/database-url.cjs');
const { ensureSchema }=require('./inventory-v3.cjs');
let pool;
function db(){if(!pool){const {databaseUrl}=parseAndValidateDatabaseUrl('inventory-v3-cutover');pool=new Pool({connectionString:databaseUrl,ssl:railwaySsl(databaseUrl),max:2});}return pool;}
async function destroyContaminatedV3DataOnce(){await ensureSchema();const q=db();await q.query(`CREATE TABLE IF NOT EXISTS inventory_v3_cutover_state(key TEXT PRIMARY KEY,completed_at TIMESTAMPTZ NOT NULL DEFAULT now())`);const state=await q.query(`SELECT 1 FROM inventory_v3_cutover_state WHERE key='destructive_clean_cutover_20260901'`);if(state.rowCount)return false;await q.query('BEGIN');try{await q.query('DELETE FROM inventory_movements_v3');await q.query('DELETE FROM inventory_stock_v3');await q.query('DELETE FROM inventory_products_v3');await q.query(`INSERT INTO inventory_v3_cutover_state(key) VALUES('destructive_clean_cutover_20260901')`);await q.query('COMMIT');return true;}catch(e){try{await q.query('ROLLBACK')}catch(_){}throw e;}}
module.exports={destroyContaminatedV3DataOnce};
