import { createHmac } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const STRIPE_DEFAULT_SECRET = 'whsec_test';
export const STRIPE_DEFAULT_EVENT = 'payment_intent.succeeded';

export const stripeFixtures: Record<string, unknown> = {
  'payment_intent.succeeded': {
    id: 'evt_1NtEvQLkdIwHu7ixGf3mDABC',
    object: 'event',
    api_version: '2024-06-20',
    created: 1718000000,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_3MtwBwLkdIwHu7ix28a3tqPa',
        object: 'payment_intent',
        amount: 2000,
        amount_received: 2000,
        currency: 'usd',
        status: 'succeeded',
        client_secret: 'pi_3MtwBwLkdIwHu7ix28a3tqPa_secret_test',
        created: 1718000000,
        customer: 'cus_NffrFeU7np17Wd',
        payment_method: 'pm_1MtwBwLkdIwHu7ix7X59Y4rK',
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_123456',
      idempotency_key: null,
    },
  },
  'customer.subscription.deleted': {
    id: 'evt_1NtEvQLkdIwHu7ixSubDeleted',
    object: 'event',
    api_version: '2024-06-20',
    created: 1718000000,
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_1MtwBwLkdIwHu7ixSub001',
        object: 'subscription',
        customer: 'cus_NffrFeU7np17Wd',
        status: 'canceled',
        cancel_at_period_end: false,
        canceled_at: 1718000000,
        current_period_start: 1715000000,
        current_period_end: 1718000000,
        items: {
          object: 'list',
          data: [
            {
              id: 'si_12345',
              price: {
                id: 'price_123',
                currency: 'usd',
                unit_amount: 2900,
              },
            },
          ],
        },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_123456',
      idempotency_key: null,
    },
  },
  'invoice.payment_failed': {
    id: 'evt_1NtEvQLkdIwHu7ixInvFailed',
    object: 'event',
    api_version: '2024-06-20',
    created: 1718000000,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_1MtwBwLkdIwHu7ixInv001',
        object: 'invoice',
        customer: 'cus_NffrFeU7np17Wd',
        amount_due: 4200,
        amount_paid: 0,
        amount_remaining: 4200,
        currency: 'usd',
        attempt_count: 1,
        attempted: true,
        paid: false,
        status: 'open',
        charge: 'ch_123456',
        hosted_invoice_url: 'https://invoice.stripe.com/i/acct_123/inv_123',
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_123456',
      idempotency_key: null,
    },
  },
};

export function getStripeFixture(event: string = STRIPE_DEFAULT_EVENT): unknown {
  if (stripeFixtures[event]) {
    return stripeFixtures[event];
  }
  return {
    id: `evt_${Date.now()}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: event,
    data: {
      object: {
        id: `obj_${Date.now()}`,
        status: 'active',
      },
    },
    livemode: false,
  };
}

export function computeStripeSignature(
  secret: string,
  timestamp: number,
  rawBody: Buffer
): string {
  const baseString = `${timestamp}.${rawBody.toString('utf8')}`;
  const hmacHex = createHmac('sha256', secret).update(baseString).digest('hex');
  return `t=${timestamp},v1=${hmacHex}`;
}

export const stripeProvider: ProviderDefinition = {
  name: 'stripe',
  defaultSecret: STRIPE_DEFAULT_SECRET,
  defaultEvent: STRIPE_DEFAULT_EVENT,
  getFixture: getStripeFixture,
  sign({ rawBody, secret, timestamp }) {
    const signature = computeStripeSignature(secret, timestamp, rawBody);
    return {
      'stripe-signature': signature,
      'content-type': 'application/json',
    };
  },
};
