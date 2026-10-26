// Refuse passwords that are easy to guess: ones found in public data leaks (Have I Been
// Pwned, k-anonymity: only the first 5 characters of the SHA-1 hash leave the server, never
// the password) and ones that are just the username / email. A leak-list outage never
// blocks sign-up (3 s timeout, then allowed). PASSWORD_LEAK_CHECK=false turns it off.
const crypto = require('crypto');

const RANGE_URL = () => process.env.PWNED_RANGE_URL || 'https://api.pwnedpasswords.com/range/';

async function leakCount(password) {
  if (process.env.PASSWORD_LEAK_CHECK === 'false') return 0;
  const hash = crypto.createHash('sha1').update(String(password)).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const rest = hash.slice(5);
  try {
    const r = await fetch(RANGE_URL() + prefix, { headers: { 'Add-Padding': 'true', 'User-Agent': 'NexusZone' }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return 0;
    const text = await r.text();
    for (const line of text.split('\n')) {
      const [suffix, count] = line.trim().split(':');
      if (suffix === rest) return Number(count) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

// null = fine; otherwise the reason code.
async function weakReason(password, { username, email } = {}) {
  const p = String(password || '').toLowerCase();
  const local = String(email || '').toLowerCase().split('@')[0];
  if ((username && p.includes(String(username).toLowerCase())) || (local.length >= 4 && p.includes(local))) return 'password_like_name';
  if (/^(.)\1+$/.test(p) || ['12345678', '123456789', '1234567890', 'password', 'qwertyui', '11111111'].includes(p)) return 'password_leaked';
  if ((await leakCount(password)) > 0) return 'password_leaked';
  return null;
}

module.exports = { weakReason, leakCount };
