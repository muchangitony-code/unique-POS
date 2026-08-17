'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMpesaPhone } = require('./phone.cjs');

test('normalizes Kenyan M-Pesa mobile numbers', () => {
  assert.equal(normalizeMpesaPhone('0712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('+254712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('254712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('0112345678'), '254112345678');
  assert.equal(normalizeMpesaPhone('112345678'), '254112345678');
});

test('rejects invalid M-Pesa numbers', () => {
  for (const value of ['', '12345', '072123456', '07312345678', '255712345678', '254812345678', 'hello']) {
    assert.throws(() => normalizeMpesaPhone(value), /valid Kenyan M-Pesa/);
  }
});
