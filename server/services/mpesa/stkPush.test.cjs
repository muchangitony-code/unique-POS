'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nairobiTimestamp,stkPassword}=require('./stkPush.cjs');

test('Nairobi timestamp has Daraja format',()=>{const s=nairobiTimestamp(new Date('2026-08-17T08:30:45.000Z'));assert.match(s,/^\d{14}$/);assert.equal(s,'20260817113045');});
test('STK password is base64(shortcode + passkey + timestamp)',()=>{assert.equal(stkPassword('123456','secret','20260817113045'),Buffer.from('123456secret20260817113045').toString('base64'));});
