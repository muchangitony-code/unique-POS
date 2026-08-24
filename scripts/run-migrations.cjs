'use strict';

const { applyMigrations } = require('./migration-engine.cjs');

function requireDirectMigrationGate() {
  const token = String(process.env.MIGRATION_DEPLOY_TOKEN || '');
  if (token.length < 32 || process.env.MIGRATION_CONFIRMATION !== 'APPLY_MIGRATIONS') {
    throw new Error('Direct migration execution is blocked. Use npm run db:migrate with MIGRATION_DEPLOY_TOKEN and MIGRATION_CONFIRMATION=APPLY_MIGRATIONS.');
  }
}

if (require.main === module) {
  try {
    requireDirectMigrationGate();
    applyMigrations().then((result) => {
      console.log('[migrations] Completed', result);
    }).catch((err) => {
      console.error('[migrations] Failed', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('[migrations] Failed:', err.message || err);
    process.exit(1);
  }
}

module.exports = { applyMigrations };
