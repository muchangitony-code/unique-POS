'use strict';

/**
 * Production seed guard.
 *
 * Test/demo data is only allowed when:
 *   1. NODE_ENV is not production, OR
 *   2. an explicit isolated schema is supplied and exists.
 *
 * Production application tables are never a valid seed target.
 */
async function assertSafeSeedTarget(client, options = {}) {
  const nodeEnv = String(process.env.NODE_ENV || 'production').toLowerCase();
  const schema = String(options.schema || process.env.SEED_SCHEMA || '').trim();

  if (nodeEnv === 'production' && !schema) {
    throw new Error('Seed guard: refusing to write test/seed data into production. Set SEED_SCHEMA to an isolated test schema.');
  }

  if (schema) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(schema) || schema === 'public') {
      throw new Error(`Seed guard: invalid isolated schema "${schema}".`);
    }
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SELECT set_config('search_path', $1, false)`, [`"${schema}", public`]);
  }

  return { schema: schema || 'non-production database' };
}

module.exports = { assertSafeSeedTarget };
