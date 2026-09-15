import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderName, SignedPayload } from './types.js';

export interface VerifyOptions {
  secret?: string;
  provider?: ProviderName;
  toleranceSeconds?: number;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature of a signed webhook payload across Stripe, GitHub, or Standard webhooks.
 */
export function verify(
  payload: SignedPayload | { headers: Record<string, string>; rawBody: Buffer; secret?: string; provider?: ProviderName },
  options: VerifyOptions = {}
): boolean {
  const headers = payload.headers || {};
  const rawBody = payload.rawBody;
  const secret = options.secret || ('secret' in payload ? payload.secret : undefined);

  if (!secret) {
    throw new Error('Secret is required for signature verification');
  }

  // Detect provider
  let provider = options.provider || ('provider' in payload ? payload.provider : undefined);
  if (!provider) {
    if ('stripe-signature' in headers) {
      provider = 'stripe';
    } else if ('x-hub-signature-256' in headers) {
      provider = 'github';
    } else if ('webhook-signature' in headers) {
      provider = 'standard';
    } else {
      throw new Error('Unable to determine webhook provider from headers');
    }
  }

  if (provider === 'stripe') {
    const header = headers['stripe-signature'];
    if (!header) return false;

    const parts = header.split(',');
    let timestamp: number | undefined;
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, val] = part.split('=');
      if (key === 't') {
        timestamp = parseInt(val, 10);
      } else if (key === 'v1') {
        signatures.push(val);
      }
    }

    if (timestamp === undefined || signatures.length === 0) return false;

    if (options.toleranceSeconds !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > options.toleranceSeconds) {
        return false;
      }
    }

    const baseString = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret).update(baseString).digest('hex');

    return signatures.some((sig) => safeCompare(sig, expected));
  }

  if (provider === 'github') {
    const header = headers['x-hub-signature-256'];
    if (!header || !header.startsWith('sha256=')) return false;

    const sig = header.slice('sha256='.length);
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    return safeCompare(sig, expected);
  }

  if (provider === 'standard') {
    const sigHeader = headers['webhook-signature'];
    const id = headers['webhook-id'];
    const timestamp = headers['webhook-timestamp'];

    if (!sigHeader || !id || !timestamp) return false;

    if (options.toleranceSeconds !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      const parsedTs = parseInt(timestamp, 10);
      if (isNaN(parsedTs) || Math.abs(now - parsedTs) > options.toleranceSeconds) {
        return false;
      }
    }

    const baseString = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret).update(baseString).digest('base64');

    // Signatures in standard webhooks can be space-separated "v1,<sig> v1,<sig2>"
    const signatures = sigHeader
      .split(' ')
      .map((item) => item.trim())
      .filter((item) => item.startsWith('v1,'))
      .map((item) => item.slice('v1,'.length));

    return signatures.some((sig) => safeCompare(sig, expected));
  }

  return false;
}
