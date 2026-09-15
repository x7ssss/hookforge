import { createHmac, randomBytes } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const STANDARD_DEFAULT_SECRET = 'whsec_test';
export const STANDARD_DEFAULT_EVENT = 'user.created';

export const standardFixtures: Record<string, unknown> = {
  'user.created': {
    id: 'usr_1001',
    email: 'alex@example.com',
    name: 'Alex Smith',
    created_at: '2026-09-16T00:00:00.000Z',
    status: 'active',
  },
};

export function getStandardFixture(event: string = STANDARD_DEFAULT_EVENT): unknown {
  if (standardFixtures[event]) {
    return standardFixtures[event];
  }
  return {
    id: `obj_${Date.now()}`,
    event,
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      status: 'success',
    },
  };
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export function computeStandardSignature(
  id: string,
  timestamp: number,
  rawBody: Buffer,
  secret: string
): string {
  const baseString = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  const base64 = createHmac('sha256', secret).update(baseString).digest('base64');
  return `v1,${base64}`;
}

export const standardProvider: ProviderDefinition = {
  name: 'standard',
  defaultSecret: STANDARD_DEFAULT_SECRET,
  defaultEvent: STANDARD_DEFAULT_EVENT,
  getFixture: getStandardFixture,
  sign({ rawBody, secret, timestamp, id = generateMessageId() }) {
    const signature = computeStandardSignature(id, timestamp, rawBody, secret);
    return {
      'webhook-id': id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': signature,
      'content-type': 'application/json',
    };
  },
};
