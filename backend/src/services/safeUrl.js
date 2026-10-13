// Outgoing webhooks go to URLs that Hosts type in. Without checks the server could be
// made to call internal addresses (SSRF): localhost, the cloud metadata service,
// private networks. Only public https URLs are allowed.
const dns = require('dns').promises;
const net = require('net');

const allowInsecure = () => process.env.ALLOW_INSECURE_WEBHOOKS === 'true'; // local tests only

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

// Shape check (when saving). Returns an error message or null.
function webhookUrlProblem(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return 'Webhook URL is not valid.';
  }
  if (u.protocol !== 'https:') return 'Webhook URL must start with https://';
  if (u.username || u.password) return 'Webhook URL must not contain a username or password.';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return 'Webhook URL must be a public address.';
  if (net.isIP(host) && isPrivateIp(host)) return 'Webhook URL must be a public address.';
  return null;
}

// Full check right before sending (DNS can point a public name at a private address).
async function assertPublicUrl(raw) {
  if (allowInsecure()) return; // local test stand-ins only; saving a URL is always checked
  const problem = webhookUrlProblem(raw);
  if (problem) throw new Error(problem);
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Webhook URL must be a public address.');
}

module.exports = { webhookUrlProblem, assertPublicUrl, isPrivateIp };
