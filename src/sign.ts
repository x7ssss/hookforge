import { getProvider } from './providers/index.js';
import type { ProviderName, SignedPayload, WebhookOptions } from './types.js';

/**
 * Signs a webhook payload according to the provider's signature specification.
 * Pure function that guarantees rawBody is strictly returned as a Buffer without
 * re-serialization or byte encoding alterations.
 */
export function sign(
  provider: ProviderName,
  options: WebhookOptions = {}
): SignedPayload {
  const providerDef = getProvider(provider);

  const event = options.event || providerDef.defaultEvent;
  const secret = options.secret || providerDef.defaultSecret;
  const timestamp =
    typeof options.timestamp === 'number'
      ? options.timestamp
      : Math.floor(Date.now() / 1000);

  // Strictly preserve byte integrity: if a Buffer is provided, keep it untouched.
  let rawBody: Buffer;
  const rawInput = options.payload !== undefined ? options.payload : options.body;

  if (rawInput !== undefined) {
    if (Buffer.isBuffer(rawInput)) {
      rawBody = rawInput;
    } else if (typeof rawInput === 'string') {
      rawBody = Buffer.from(rawInput, 'utf8');
    } else {
      rawBody = Buffer.from(JSON.stringify(rawInput), 'utf8');
    }
  } else {
    const fixture = providerDef.getFixture(event);
    rawBody = Buffer.from(JSON.stringify(fixture), 'utf8');
  }

  const id = options.id;
  const targetUrl =
    (typeof options.targetUrl === 'string' ? options.targetUrl : undefined) ||
    (typeof options.url === 'string' ? options.url : undefined) ||
    'http://localhost:3000/api/webhooks';

  const headers = providerDef.sign({
    rawBody,
    secret,
    timestamp,
    event,
    id,
    targetUrl,
  });

  const resolvedId = id || headers['webhook-id'] || headers['svix-id'];

  return {
    headers: { ...headers },
    rawBody,
    secret,
    event,
    timestamp,
    provider,
    targetUrl,
    ...(resolvedId ? { id: resolvedId } : {}),
  };
}
