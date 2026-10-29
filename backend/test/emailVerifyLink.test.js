const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/services/emailVerify');

test('verify link: token carries the account id and a signature', () => {
  const uid = 'aaaaaaaa-0000-4000-8000-000000000001';
  const t = E.makeToken(uid, 'An@Gmail.com');
  const [u, exp, sig] = t.split('.');
  assert.strictEqual(Buffer.from(u, 'base64url').toString(), uid);
  assert.ok(Number(exp) > Date.now() / 1000 + 3600);
  assert.ok(sig.length > 20);
  // Same account + email (any case) → same signature; another email → another one.
  assert.strictEqual(E.makeToken(uid, 'an@gmail.com').split('.')[2], sig);
  assert.notStrictEqual(E.makeToken(uid, 'other@gmail.com').split('.')[2], sig);
});

test('verify link: bad tokens are refused before any lookup', async () => {
  for (const t of ['', 'abc', 'a.b.c', `${Buffer.from('not-a-uuid').toString('base64url')}.9999999999.x`]) {
    await assert.rejects(E.verifyLink(t), (err) => err.code === 'bad_link');
  }
  const old = `${Buffer.from('aaaaaaaa-0000-4000-8000-000000000001').toString('base64url')}.1000.sig`;
  await assert.rejects(E.verifyLink(old), (err) => err.code === 'link_expired');
});

test('verify email: a button with the link, no code', () => {
  const { subject, html, text } = E.linkEmail('https://nexuszone.vn/verify-email?t=abc', 'verify');
  assert.match(subject, /Xác nhận email/);
  assert.match(html, /href="https:\/\/nexuszone.vn\/verify-email\?t=abc"/);
  assert.match(text, /verify-email\?t=abc/);
  assert.doesNotMatch(html, /letter-spacing:10px/);
});
