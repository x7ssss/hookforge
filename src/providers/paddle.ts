import { createHmac } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const PADDLE_DEFAULT_SECRET = 'pdl_ntfset_test';
export const PADDLE_DEFAULT_EVENT = 'subscription.created';

export const paddleFixtures: Record<string, unknown> = {
  'subscription.created': {
    event_id: 'evt_01h8bx90g7y4wpxh2000000001',
    event_type: 'subscription.created',
    occurred_at: '2026-09-16T08:00:00.000000Z',
    data: {
      id: 'sub_01h8bx90g7y4wpxh2000000001',
      status: 'active',
      customer_id: 'ctm_01h8bx80g7y4wpxh1000000001',
      address_id: 'add_01h8bx80g7y4wpxh2000000001',
      business_id: null,
      currency_code: 'USD',
      created_at: '2026-09-16T08:00:00.000000Z',
      updated_at: '2026-09-16T08:00:00.000000Z',
      items: [
        {
          price: {
            id: 'pri_01h8bx70g7y4wpxh0000000001',
            product_id: 'pro_01h8bx60g7y4wpxh9000000001',
            description: 'HookForge Pro Monthly',
            unit_price: {
              amount: '2900',
              currency_code: 'USD',
            },
          },
          quantity: 1,
        },
      ],
    },
  },
  'transaction.completed': {
    event_id: 'evt_01h8bx95g7y4wpxh3000000002',
    event_type: 'transaction.completed',
    occurred_at: '2026-09-16T08:05:00.000000Z',
    data: {
      id: 'txn_01h8bx95g7y4wpxh3000000002',
      status: 'completed',
      customer_id: 'ctm_01h8bx80g7y4wpxh1000000001',
      address_id: 'add_01h8bx80g7y4wpxh2000000001',
      currency_code: 'USD',
      created_at: '2026-09-16T08:05:00.000000Z',
      updated_at: '2026-09-16T08:05:00.000000Z',
      details: {
        totals: {
          subtotal: '2900',
          tax: '0',
          total: '2900',
          currency_code: 'USD',
        },
      },
      payments: [
        {
          payment_attempt_id: 'pay_01h8bx95g7y4wpxh4000000001',
          amount: '2900',
          status: 'captured',
          created_at: '2026-09-16T08:05:00.000000Z',
        },
      ],
    },
  },
};

export function getPaddleFixture(event: string = PADDLE_DEFAULT_EVENT): unknown {
  if (paddleFixtures[event]) {
    return paddleFixtures[event];
  }
  return {
    event_id: `evt_${Date.now()}`,
    event_type: event,
    occurred_at: new Date().toISOString(),
    data: {
      id: `obj_${Date.now()}`,
      status: 'active',
    },
  };
}

export function computePaddleSignature(
  secret: string,
  timestamp: number,
  rawBody: Buffer
): string {
  const baseString = `${timestamp}:${rawBody.toString('utf8')}`;
  const hmacHex = createHmac('sha256', secret).update(baseString).digest('hex');
  return `ts=${timestamp};h1=${hmacHex}`;
}

export const paddleProvider: ProviderDefinition = {
  name: 'paddle',
  defaultSecret: PADDLE_DEFAULT_SECRET,
  defaultEvent: PADDLE_DEFAULT_EVENT,
  getFixture: getPaddleFixture,
  sign({ rawBody, secret, timestamp }) {
    const signature = computePaddleSignature(secret, timestamp, rawBody);
    return {
      'Paddle-Signature': signature,
      'content-type': 'application/json',
    };
  },
};
