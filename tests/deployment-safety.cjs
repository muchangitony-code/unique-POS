'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { scanMigrations } = require('../scripts/migration-safety.cjs');

function read(file) { return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'); }

const app = read('app.js');
const bootstrap = read('scripts/bootstrap-db.cjs');
const reset = read('scripts/production-reset.cjs');
const packageJson = JSON.parse(read('package.json'));
const policy = JSON.parse(read('migration-safety.json'));

if (/applyMigrations/.test(bootstrap)) throw new Error('Application bootstrap must not import or call applyMigrations.');
if (/scope === ['"]all['"]|scope === ['"]all['"]|RESET_SCOPE.*all/.test(reset)) throw new Error('Production reset all mode must remain removed.');
if (/TRUNCATE TABLE[\s\S]*CASCADE|CASCADE/.test(reset)) throw new Error('Production reset must not contain CASCADE.');
if (packageJson.scripts['db:migrate'] !== 'node scripts/deploy-migrations.cjs') throw new Error('db:migrate must use the explicit deployment gate.');
if (!packageJson.scripts['db:migration-audit']) throw new Error('db:migration-audit script is missing.');
if (!/UNIQUEPOS_DISABLE_INTERNAL_STARTUP_MIGRATIONS/.test(app)) throw new Error('Application startup must disable internal migration paths before loading the runtime bundle.');

const scanned = scanMigrations(path.resolve(__dirname, '..', 'migrations'));
const knownRetired = [
  '0011_production_clean_start.sql',
  '0012_clear_stale_bulk_import_history.sql',
  '0013_production_clear_product_catalog.sql',
  '0014_force_clean_test_catalog.sql',
  '0023_production_catalog_clean_slate.sql',
  '0023_production_catalog_wipe.sql',
  '0023_production_clean_slate_catalog.sql',
  '0026_inventory_clean_start.sql'
];
for (const name of knownRetired) {
  const row = scanned.find((item) => item.name === name);
  if (!row) throw new Error(`Known destructive migration missing from scan: ${name}`);
  if (!row.destructive) throw new Error(`Known destructive migration was not classified as destructive: ${name}`);
  if (policy[name]?.action !== 'retired') throw new Error(`Known historical destructive migration is not marked retired: ${name}`);
}

const unknownDestructive = scanned.filter((row) => row.destructive && !policy[row.name]);
console.log(JSON.stringify({
  checkedMigrations: scanned.length,
  knownRetired,
  unknownDestructive: unknownDestructive.map((row) => ({ name: row.name, findings: row.findings }))
}, null, 2));
console.log('Deployment safety regression checks passed.');
