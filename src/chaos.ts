import { computeStripeSignature } from './providers/stripe.js';
import { computeStandardSignature } from './providers/standard.js';
import type { SignedPayload } from './types.js';

/**
 * Mutates 1 byte in rawBody without updating signature headers.
 * Guarantees cryptographic verification failure on receiving servers.
 */
export function tamper(payload: SignedPayload): SignedPayload {
  const mutated = Buffer.from(payload.rawBody);

  if (mutated.length === 0) {
    return {
      ...payload,
      headers: { ...payload.headers },
      rawBody: Buffer.from([0x01]),
    };
  }

  // Mutate exactly 1 byte (flip lowest bit of byte 0)
  mutated[0] ^= 0x01;

  return {
    ...payload,
    headers: { ...payload.headers },
    rawBody: mutated,
  };
}

/**
 * Preserves identical timestamp and signature headers for replay testing.
 */
export function replay(payload: SignedPayload): SignedPayload {
  return {
    ...payload,
    headers: { ...payload.headers },
    rawBody: Buffer.from(payload.rawBody),
  };
}

/**
 * Recalculates signature using a stale timestamp.
 * Useful for testing timestamp drift, replay prevention, and expiration policies.
 */
export function skew(
  payload: SignedPayload,
  secondsAgo: number = 300
): SignedPayload {
  const staleTimestamp = payload.timestamp - secondsAgo;
  const newHeaders = { ...payload.headers };

  // Detect provider either from explicit property or signature headers
  const isStripe =
    payload.provider === 'stripe' || 'stripe-signature' in newHeaders;
  const isStandard =
    payload.provider === 'standard' || 'webhook-signature' in newHeaders;

  if (isStripe) {
    newHeaders['stripe-signature'] = computeStripeSignature(
      payload.secret,
      staleTimestamp,
      payload.rawBody
    );
  } else if (isStandard) {
    const id = payload.id || newHeaders['webhook-id'] || 'msg_skew';
    newHeaders['webhook-signature'] = computeStandardSignature(
      id,
      staleTimestamp,
      payload.rawBody,
      payload.secret
    );
    newHeaders['webhook-timestamp'] = String(staleTimestamp);
    newHeaders['webhook-id'] = id;
  }

  return {
    ...payload,
    headers: newHeaders,
    timestamp: staleTimestamp,
  };
}
