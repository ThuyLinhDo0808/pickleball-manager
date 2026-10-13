const test = require('node:test');
const assert = require('node:assert');
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
const s = require('../src/services/accountSecurity');

test('base32 round trip', () => {
  const buf = Buffer.from('12345678901234567890');
  assert.strictEqual(s.base32Encode(buf), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepStrictEqual(s.base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), buf);
});

test('TOTP matches RFC 6238 test vectors (SHA-1, last 6 digits)', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.strictEqual(s.totp(secret, 59 * 1000), '287082');
  assert.strictEqual(s.totp(secret, 1111111109 * 1000), '081804');
  assert.strictEqual(s.totp(secret, 1234567890 * 1000), '005924');
  assert.strictEqual(s.totp(secret, 2000000000 * 1000), '279037');
});

test('matchStep accepts ±1 step, rejects others and junk', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const now = 1234567890 * 1000;
  const step = Math.floor(1234567890 / 30);
  assert.strictEqual(s.matchStep(secret, s.totp(secret, now), now), step);
  assert.strictEqual(s.matchStep(secret, s.totp(secret, now - 30000), now), step - 1);
  assert.strictEqual(s.matchStep(secret, s.totp(secret, now + 30000), now), step + 1);
  assert.strictEqual(s.matchStep(secret, s.totp(secret, now - 90000), now), null);
  assert.strictEqual(s.matchStep(secret, 'abcdef', now), null);
  assert.strictEqual(s.matchStep(secret, '12345', now), null);
});

test('secret encryption round trip; tampering is detected', () => {
  process.env.MFA_ENC_KEY = 'a'.repeat(64);
  const blob = s.encrypt('JBSWY3DPEHPK3PXP');
  assert.notStrictEqual(blob, 'JBSWY3DPEHPK3PXP');
  assert.strictEqual(s.decrypt(blob), 'JBSWY3DPEHPK3PXP');
  const parts = blob.split(':');
  parts[3] = Buffer.from('tampered!').toString('base64');
  assert.throws(() => s.decrypt(parts.join(':')));
  process.env.MFA_ENC_KEY = 'b'.repeat(64);
  assert.throws(() => s.decrypt(blob)); // other key
  delete process.env.MFA_ENC_KEY;
});

test('tokenInfo uses session_id and iat', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = `${b64({ alg: 'HS256' })}.${b64({ session_id: 'abc', iat: 1700000000 })}.sig`;
  assert.deepStrictEqual(s.tokenInfo(tok), { sessionKey: 's:abc', iat: 1700000000 });
  const other = s.tokenInfo('user:1234');
  assert.match(other.sessionKey, /^t:[0-9a-f]{64}$/);
  assert.strictEqual(other.iat, null);
});

test('ip hint and device label', () => {
  assert.strictEqual(s.ipHint('113.161.12.34'), '113.161.12.x');
  assert.strictEqual(s.ipHint('::ffff:10.0.0.7'), '10.0.0.x');
  assert.match(s.ipHint('2001:db8:85a3:0:0:8a2e:370:7334'), /^2001:db8:85a3:…$/);
  assert.strictEqual(s.deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537'), 'Chrome · Windows');
  assert.strictEqual(s.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17 Mobile Safari/604'), 'Safari · iPhone/iPad');
});

test('recovery codes hash ignores case and separators', () => {
  assert.strictEqual(s.hashCode('AB12C-3DE45'), s.hashCode('ab12c3de45'));
});
