'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseAndValidateDatabaseUrl } = require('./database-url.cjs');

function main() {
  const { databaseUrl } = parseAndValidateDatabaseUrl('migration-backup');
  const backupDir = path.resolve(process.env.MIGRATION_BACKUP_DIR || process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'));
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.join(backupDir, `pre-migration-${stamp}.dump`);
  const result = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', output, databaseUrl], {
    stdio: 'inherit'
  });

  if (result.error) throw new Error(`pg_dump could not be started: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`pg_dump failed with exit code ${result.status}. Migration will not run.`);

  const stat = fs.statSync(output);
  if (!stat.isFile() || stat.size < 1024) throw new Error(`Backup was created but is invalid or too small: ${output}`);

  // Parse the custom-format archive table before allowing a destructive
  // migration to proceed. File size alone does not establish archive integrity.
  const validation = spawnSync('pg_restore', ['--list', output], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (validation.error) throw new Error(`pg_restore validation could not start: ${validation.error.message}`);
  if (validation.status !== 0 || !String(validation.stdout || '').includes('Dumped from database version')) {
    throw new Error('Backup archive validation failed. Migration will not run.');
  }

  console.log(JSON.stringify({ backupFile: output, bytes: stat.size, archiveValidated: true, createdAt: new Date().toISOString() }));
  return output;
}

try {
  main();
} catch (error) {
  console.error('[migration-backup] FAILED:', error.message || error);
  process.exit(1);
}
