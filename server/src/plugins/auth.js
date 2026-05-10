import fp from 'fastify-plugin';
import { timingSafeEqual } from 'node:crypto';
import ipaddr from 'ipaddr.js';

const WARNED_IPS_MAX = 1024;

function safeTokenCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isTrustedIp(ip, cidrs) {
  if (!ip) return false;
  let addr;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return false;
  }
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) to its IPv4 form so
  // operator-supplied IPv4 CIDRs match the way they read.
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }
  for (const cidr of cidrs) {
    let parsed;
    try {
      parsed = ipaddr.parseCIDR(cidr);
    } catch {
      // Skip malformed CIDR entries — config validation runs at boot,
      // but the runtime hot path must never crash on bad input.
      continue;
    }
    if (addr.kind() === parsed[0].kind() && addr.match(parsed)) return true;
  }
  return false;
}

async function authPlugin(fastify) {
  const warnedIps = new Set();

  fastify.addHook('onRequest', async (request, reply) => {
    if (fastify.config.authDisabled) {
      const ip = request.ip;
      if (isTrustedIp(ip, fastify.config.trustedCidrs)) return;

      // Untrusted IP — log loud warning once per IP, then reject.
      // Cap-and-clear bounds the Set so a public-IP scanner cannot grow it
      // without bound (and operators continue to see warnings after cycling).
      if (!warnedIps.has(ip)) {
        if (warnedIps.size >= WARNED_IPS_MAX) warnedIps.clear();
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
