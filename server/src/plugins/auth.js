import fp from 'fastify-plugin';
import { timingSafeEqual } from 'node:crypto';

function safeTokenCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255 || p === '') return null;
    n = (n << 8) + o;
  }
  return n >>> 0;
}

// Strip ::ffff: prefix on IPv4-mapped addresses (Node dual-stack reports these)
function normalizeIp(ip) {
  if (!ip) return null;
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function ipInCidr(ip, cidr) {
  const slashIdx = cidr.indexOf('/');
  const range = slashIdx === -1 ? cidr : cidr.slice(0, slashIdx);
  const bits = slashIdx === -1 ? null : parseInt(cidr.slice(slashIdx + 1), 10);

  // IPv6 loopback — only matches itself (we already normalize ::ffff:127.* to IPv4)
  if (range === '::1') return ip === '::1';

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  const prefix = bits === null ? 32 : bits;
  if (prefix === 0) return true;
  const mask = ((0xFFFFFFFF << (32 - prefix)) >>> 0);
  return (ipInt & mask) === (rangeInt & mask);
}

function isTrustedIp(ip, cidrs) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  for (const c of cidrs) {
    if (ipInCidr(normalized, c)) return true;
  }
  return false;
}

async function authPlugin(fastify) {
  const warnedIps = new Set();

  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if ((request.url === '/api/health' || request.url.startsWith('/api/health?')) && request.method === 'GET') return;
    if ((request.url === '/api/config' || request.url.startsWith('/api/config?')) && request.method === 'GET') return;

    if (fastify.config.authDisabled) {
      const ip = request.ip;
      if (isTrustedIp(ip, fastify.config.trustedCidrs)) return;

      // Untrusted IP — log loud warning once per IP, then reject
      if (!warnedIps.has(ip)) {
        warnedIps.add(ip);
        const xff = request.headers['x-forwarded-for'];
        fastify.log.warn(
          { ip, x_forwarded_for: xff },
          '⚠ AUTH DISABLED: rejected request from untrusted IP — review LATTICE_TRUSTED_CIDRS or your network exposure'
        );
      }
      reply.code(401).send({ error: 'Unauthorized', message: 'Source IP not in trusted CIDRs' });
      return;
    }

    const header = request.headers.authorization;
    if (!header) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
      return;
    }

    const token = header.replace(/^Bearer\s+/i, '');
    if (!safeTokenCompare(token, fastify.config.apiToken)) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
      return;
    }
  });
}

export default fp(authPlugin, {
  name: 'lattice-auth',
  dependencies: ['lattice-config'],
  fastify: '5.x',
});

// Exposed for tests
export { isTrustedIp, ipInCidr };
