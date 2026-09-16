import { computeStripeSignature } from './providers/stripe.js';
import { computeStandardSignature } from './providers/standard.js';
import { computeSlackSignature } from './providers/slack.js';
import { computePaddleSignature } from './providers/paddle.js';
import { computeResendSignature } from './providers/resend.js';
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
    payload.provider === 'standard' ||
    payload.provider === 'svix' ||
    'webhook-signature' in newHeaders;
  const isSlack =
    payload.provider === 'slack' ||
    'x-slack-signature' in newHeaders ||
    'X-Slack-Signature' in newHeaders;
  const isPaddle =
    payload.provider === 'paddle' ||
    'paddle-signature' in newHeaders ||
    'Paddle-Signature' in newHeaders;
  const isResend =
    payload.provider === 'resend' || 'svix-signature' in newHeaders;

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
  } else if (isSlack) {
    const sig = computeSlackSignature(
      payload.secret,
      staleTimestamp,
      payload.rawBody
    );
    const keySig =
      'X-Slack-Signature' in newHeaders
        ? 'X-Slack-Signature'
        : 'x-slack-signature';
    const keyTs =
      'X-Slack-Request-Timestamp' in newHeaders
        ? 'X-Slack-Request-Timestamp'
        : 'x-slack-request-timestamp';
    newHeaders[keySig] = sig;
    newHeaders[keyTs] = String(staleTimestamp);
  } else if (isPaddle) {
    const sig = computePaddleSignature(
      payload.secret,
      staleTimestamp,
      payload.rawBody
    );
    const key =
      'Paddle-Signature' in newHeaders ? 'Paddle-Signature' : 'paddle-signature';
    newHeaders[key] = sig;
  } else if (isResend) {
    const id = payload.id || newHeaders['svix-id'] || 'msg_skew';
    newHeaders['svix-signature'] = computeResendSignature(
      id,
      staleTimestamp,
      payload.rawBody,
      payload.secret
    );
    newHeaders['svix-timestamp'] = String(staleTimestamp);
    newHeaders['svix-id'] = id;
  }

  return {
    ...payload,
    headers: newHeaders,
    timestamp: staleTimestamp,
  };
}
