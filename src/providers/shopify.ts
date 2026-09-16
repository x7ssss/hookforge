import { createHmac } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const SHOPIFY_DEFAULT_SECRET = 'shpss_test';
export const SHOPIFY_DEFAULT_EVENT = 'orders/create';

export const shopifyFixtures: Record<string, unknown> = {
  'orders/create': {
    id: 820982911946154508,
    admin_graphql_api_id: 'gid://shopify/Order/820982911946154508',
    email: 'jon@example.com',
    created_at: '2026-09-16T08:00:00-04:00',
    updated_at: '2026-09-16T08:00:00-04:00',
    number: 234,
    token: '123456abcd7890ef',
    total_price: '199.00',
    subtotal_price: '199.00',
    total_weight: 0,
    total_tax: '0.00',
    taxes_included: false,
    currency: 'USD',
    financial_status: 'paid',
    confirmed: true,
    name: '#1234',
    line_items: [
      {
        id: 866550311766439020,
        variant_id: 4321,
        title: 'HookForge Pro Subscription',
        quantity: 1,
        sku: 'HF-PRO-01',
        price: '199.00',
        grams: 0,
      },
    ],
    customer: {
      id: 115315648,
      email: 'jon@example.com',
      first_name: 'Jon',
      last_name: 'Doe',
    },
  },
};

export function getShopifyFixture(event: string = SHOPIFY_DEFAULT_EVENT): unknown {
  if (shopifyFixtures[event]) {
    return shopifyFixtures[event];
  }
  return {
    id: Date.now(),
    topic: event,
    created_at: new Date().toISOString(),
    customer: {
      id: 115315648,
      email: 'jon@example.com',
    },
  };
}

export function computeShopifySignature(secret: string, rawBody: Buffer): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

export const shopifyProvider: ProviderDefinition = {
  name: 'shopify',
  defaultSecret: SHOPIFY_DEFAULT_SECRET,
  defaultEvent: SHOPIFY_DEFAULT_EVENT,
  getFixture: getShopifyFixture,
  sign({ rawBody, secret, event }) {
    const signature = computeShopifySignature(secret, rawBody);
    return {
      'X-Shopify-Hmac-Sha256': signature,
      'X-Shopify-Topic': event,
      'X-Shopify-Shop-Domain': 'test-shop.myshopify.com',
      'content-type': 'application/json',
    };
  },
};
