import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  sign,
  STRIPE_DEFAULT_SECRET,
  STRIPE_DEFAULT_EVENT,
  GITHUB_DEFAULT_SECRET,
  GITHUB_DEFAULT_EVENT,
  STANDARD_DEFAULT_SECRET,
  STANDARD_DEFAULT_EVENT,
  SHOPIFY_DEFAULT_SECRET,
  SHOPIFY_DEFAULT_EVENT,
  SLACK_DEFAULT_SECRET,
  SLACK_DEFAULT_EVENT,
  verify,
} from '../src/index.js';

describe('Webhook Signing - src/sign.ts', () => {
  describe('Stripe Provider', () => {
    it('signs default payment_intent.succeeded event with valid HMAC', () => {
      const signed = sign('stripe');

      expect(signed.provider).toBe('stripe');
      expect(signed.event).toBe(STRIPE_DEFAULT_EVENT);
      expect(signed.secret).toBe(STRIPE_DEFAULT_SECRET);
      expect(Buffer.isBuffer(signed.rawBody)).toBe(true);

      const signatureHeader = signed.headers['stripe-signature'];
      expect(signatureHeader).toBeDefined();
      expect(signed.headers['content-type']).toBe('application/json');

      // Header format: t=${timestamp},v1=${hmacHex}
      const match = signatureHeader.match(/^t=(\d+),v1=([a-f0-9]{64})$/);
      expect(match).not.toBeNull();
      const headerTimestamp = parseInt(match![1], 10);
      const headerHex = match![2];

      expect(headerTimestamp).toBe(signed.timestamp);

      // Independent HMAC verification
      const baseString = `${signed.timestamp}.${signed.rawBody.toString('utf8')}`;
      const expectedHex = createHmac('sha256', signed.secret)
        .update(baseString)
        .digest('hex');

      expect(headerHex).toBe(expectedHex);
      expect(verify(signed)).toBe(true);
    });

    it('signs customer.subscription.deleted event with realistic fixture', () => {
      const signed = sign('stripe', { event: 'customer.subscription.deleted' });

      expect(signed.event).toBe('customer.subscription.deleted');
      const body = JSON.parse(signed.rawBody.toString('utf8'));
      expect(body.type).toBe('customer.subscription.deleted');
      expect(body.data.object.object).toBe('subscription');
      expect(body.data.object.status).toBe('canceled');
      expect(verify(signed)).toBe(true);
    });

    it('signs invoice.payment_failed event with realistic fixture', () => {
      const signed = sign('stripe', { event: 'invoice.payment_failed' });

      expect(signed.event).toBe('invoice.payment_failed');
      const body = JSON.parse(signed.rawBody.toString('utf8'));
      expect(body.type).toBe('invoice.payment_failed');
      expect(body.data.object.object).toBe('invoice');
      expect(body.data.object.paid).toBe(false);
      expect(verify(signed)).toBe(true);
    });

    it('signs custom payload, secret, and timestamp accurately', () => {
      const customPayload = { custom: 'data', amount: 4200 };
      const customSecret = 'whsec_custom_stripe_key_123';
      const customTimestamp = 1700000000;

      const signed = sign('stripe', {
        event: 'charge.captured',
        secret: customSecret,
        payload: customPayload,
        timestamp: customTimestamp,
      });

      expect(signed.event).toBe('charge.captured');
      expect(signed.secret).toBe(customSecret);
      expect(signed.timestamp).toBe(customTimestamp);

      const parsedBody = JSON.parse(signed.rawBody.toString('utf8'));
      expect(parsedBody).toEqual(customPayload);

      // Verify HMAC against custom secret & timestamp
      const baseString = `${customTimestamp}.${signed.rawBody.toString('utf8')}`;
      const expectedHex = createHmac('sha256', customSecret)
        .update(baseString)
        .digest('hex');

      expect(signed.headers['stripe-signature']).toBe(
        `t=${customTimestamp},v1=${expectedHex}`
      );
      expect(verify(signed)).toBe(true);
    });
  });

  describe('GitHub Provider', () => {
    it('signs default push event with sha256 hex over raw bytes', () => {
      const signed = sign('github');

      expect(signed.provider).toBe('github');
      expect(signed.event).toBe(GITHUB_DEFAULT_EVENT);
      expect(signed.secret).toBe(GITHUB_DEFAULT_SECRET);
      expect(Buffer.isBuffer(signed.rawBody)).toBe(true);

      expect(signed.headers['x-github-event']).toBe('push');
      expect(signed.headers['content-type']).toBe('application/json');

      const hubSignature = signed.headers['x-hub-signature-256'];
      expect(hubSignature).toBeDefined();
      expect(hubSignature.startsWith('sha256=')).toBe(true);

      const sigHex = hubSignature.slice('sha256='.length);

      // Independent verification over raw bytes
      const expectedHex = createHmac('sha256', signed.secret)
        .update(signed.rawBody)
        .digest('hex');

      expect(sigHex).toBe(expectedHex);
      expect(verify(signed)).toBe(true);
    });

    it('signs pull_request event with realistic fixture', () => {
      const signed = sign('github', { event: 'pull_request' });

      expect(signed.event).toBe('pull_request');
      expect(signed.headers['x-github-event']).toBe('pull_request');
      const body = JSON.parse(signed.rawBody.toString('utf8'));
      expect(body.action).toBe('opened');
      expect(body.pull_request).toBeDefined();
      expect(body.pull_request.number).toBe(42);
      expect(verify(signed)).toBe(true);
    });

    it('signs custom event and raw string payload accurately', () => {
      const rawString = JSON.stringify({ action: 'opened', issue: { number: 42 } });
      const customSecret = 'gh_secret_super_secret';

      const signed = sign('github', {
        event: 'issues',
        secret: customSecret,
        payload: rawString,
      });

      expect(signed.event).toBe('issues');
      expect(signed.headers['x-github-event']).toBe('issues');

      const expectedHex = createHmac('sha256', customSecret)
        .update(Buffer.from(rawString, 'utf8'))
        .digest('hex');

      expect(signed.headers['x-hub-signature-256']).toBe(`sha256=${expectedHex}`);
      expect(verify(signed)).toBe(true);
    });
  });

  describe('Standard Webhook Provider', () => {
    it('signs default user.created event matching Standard Webhooks spec', () => {
      const signed = sign('standard');

      expect(signed.provider).toBe('standard');
      expect(signed.event).toBe(STANDARD_DEFAULT_EVENT);
      expect(signed.secret).toBe(STANDARD_DEFAULT_SECRET);
      expect(Buffer.isBuffer(signed.rawBody)).toBe(true);

      const id = signed.headers['webhook-id'];
      const timestamp = signed.headers['webhook-timestamp'];
      const signature = signed.headers['webhook-signature'];

      expect(id).toBeDefined();
      expect(timestamp).toBe(String(signed.timestamp));
      expect(signature).toBeDefined();
      expect(signature.startsWith('v1,')).toBe(true);

      const base64Sig = signature.slice('v1,'.length);

      // Independent verification according to spec: ${id}.${timestamp}.${rawBody}
      const baseString = `${id}.${timestamp}.${signed.rawBody.toString('utf8')}`;
      const expectedBase64 = createHmac('sha256', signed.secret)
        .update(baseString)
        .digest('base64');

      expect(base64Sig).toBe(expectedBase64);
      expect(verify(signed)).toBe(true);
    });

    it('signs with explicitly provided ID and secret', () => {
      const customId = 'msg_custom_999';
      const customSecret = 'whsec_standard_key_xyz';
      const customTimestamp = 1715000000;
      const customBody = JSON.stringify({ user_id: 'usr_abc', status: 'verified' });

      const signed = sign('standard', {
        id: customId,
        secret: customSecret,
        timestamp: customTimestamp,
        payload: customBody,
      });

      expect(signed.id).toBe(customId);
      expect(signed.headers['webhook-id']).toBe(customId);
      expect(signed.headers['webhook-timestamp']).toBe(String(customTimestamp));

      const baseString = `${customId}.${customTimestamp}.${customBody}`;
      const expectedBase64 = createHmac('sha256', customSecret)
        .update(baseString)
        .digest('base64');

      expect(signed.headers['webhook-signature']).toBe(`v1,${expectedBase64}`);
      expect(verify(signed)).toBe(true);
    });
  });

  describe('Shopify Provider', () => {
    it('signs default orders/create event with HMAC-SHA256 Base64 digest', () => {
      const signed = sign('shopify');

      expect(signed.provider).toBe('shopify');
      expect(signed.event).toBe(SHOPIFY_DEFAULT_EVENT);
      expect(signed.secret).toBe(SHOPIFY_DEFAULT_SECRET);
      expect(Buffer.isBuffer(signed.rawBody)).toBe(true);

      const hmacHeader = signed.headers['X-Shopify-Hmac-Sha256'];
      expect(hmacHeader).toBeDefined();
      expect(signed.headers['X-Shopify-Topic']).toBe('orders/create');
      expect(signed.headers['content-type']).toBe('application/json');

      // Independent verification over raw payload bytes
      const expectedBase64 = createHmac('sha256', signed.secret)
        .update(signed.rawBody)
        .digest('base64');

      expect(hmacHeader).toBe(expectedBase64);
      expect(verify(signed)).toBe(true);

      const body = JSON.parse(signed.rawBody.toString('utf8'));
      expect(body.id).toBe(820982911946154508);
      expect(body.financial_status).toBe('paid');
    });

    it('signs custom Shopify topic and payload accurately', () => {
      const customPayload = { id: 9999, email: 'custom@shop.com' };
      const customSecret = 'shpss_my_custom_secret_key';

      const signed = sign('shopify', {
        event: 'customers/create',
        secret: customSecret,
        payload: customPayload,
      });

      expect(signed.event).toBe('customers/create');
      expect(signed.headers['X-Shopify-Topic']).toBe('customers/create');

      const expectedBase64 = createHmac('sha256', customSecret)
        .update(signed.rawBody)
        .digest('base64');

      expect(signed.headers['X-Shopify-Hmac-Sha256']).toBe(expectedBase64);
      expect(verify(signed)).toBe(true);
    });
  });

  describe('Slack Provider', () => {
    it('signs default app_mention event with v0={hex} and X-Slack-Request-Timestamp', () => {
      const signed = sign('slack');

      expect(signed.provider).toBe('slack');
      expect(signed.event).toBe(SLACK_DEFAULT_EVENT);
      expect(signed.secret).toBe(SLACK_DEFAULT_SECRET);
      expect(Buffer.isBuffer(signed.rawBody)).toBe(true);

      const sigHeader = signed.headers['X-Slack-Signature'];
      const timestampHeader = signed.headers['X-Slack-Request-Timestamp'];

      expect(sigHeader).toBeDefined();
      expect(timestampHeader).toBe(String(signed.timestamp));
      expect(sigHeader.startsWith('v0=')).toBe(true);

      // Independent verification format: v0:{timestamp}:{raw_body}
      const baseString = `v0:${signed.timestamp}:${signed.rawBody.toString('utf8')}`;
      const expectedHex = createHmac('sha256', signed.secret)
        .update(baseString)
        .digest('hex');

      expect(sigHeader).toBe(`v0=${expectedHex}`);
      expect(verify(signed)).toBe(true);

      const body = JSON.parse(signed.rawBody.toString('utf8'));
      expect(body.type).toBe('event_callback');
      expect(body.event.type).toBe('app_mention');
    });

    it('signs custom event with explicit secret and timestamp', () => {
      const customSecret = 'slack_secret_12345';
      const customTimestamp = 1718100000;
      const customPayload = { event: { type: 'message', text: 'Hello Slack' } };

      const signed = sign('slack', {
        event: 'message',
        secret: customSecret,
        timestamp: customTimestamp,
        payload: customPayload,
      });

      const baseString = `v0:${customTimestamp}:${signed.rawBody.toString('utf8')}`;
      const expectedHex = createHmac('sha256', customSecret)
        .update(baseString)
        .digest('hex');

      expect(signed.headers['X-Slack-Signature']).toBe(`v0=${expectedHex}`);
      expect(signed.headers['X-Slack-Request-Timestamp']).toBe(String(customTimestamp));
      expect(verify(signed)).toBe(true);
    });
  });

  describe('Strict Byte Integrity', () => {
    it('preserves Buffer instance without re-serializing or altering bytes', () => {
      // Create a payload with specific formatting and whitespace
      const formattedJson = '{\n  "preserve_me":   true,\n  "count": 1\n}\n';
      const originalBuffer = Buffer.from(formattedJson, 'utf8');

      const signed = sign('stripe', { payload: originalBuffer });

      // Must be the exact same buffer contents
      expect(signed.rawBody).toBe(originalBuffer);
      expect(signed.rawBody.toString('utf8')).toBe(formattedJson);

      // Verify the signature is computed over the exact formatted bytes
      const baseString = `${signed.timestamp}.${formattedJson}`;
      const expectedHex = createHmac('sha256', signed.secret)
        .update(baseString)
        .digest('hex');

      expect(signed.headers['stripe-signature']).toBe(
        `t=${signed.timestamp},v1=${expectedHex}`
      );
    });
  });

  describe('Error Handling', () => {
    it('throws when an unsupported provider is requested', () => {
      expect(() => {
        // @ts-expect-error testing invalid provider
        sign('unknown-provider');
      }).toThrow(/Unsupported provider/i);
    });
  });
});
