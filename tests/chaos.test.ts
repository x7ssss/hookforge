import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { sign, tamper, replay, skew, chaos, verify } from '../src/index.js';

describe('Chaos Engine - src/chaos.ts', () => {
  describe('tamper()', () => {
    it('mutates 1 byte in Stripe rawBody and causes verification to fail', () => {
      const original = sign('stripe');
      expect(verify(original)).toBe(true);

      const tampered = tamper(original);

      // Signature header must be preserved identically
      expect(tampered.headers['stripe-signature']).toBe(
        original.headers['stripe-signature']
      );
      expect(tampered.timestamp).toBe(original.timestamp);

      // Raw body must differ by exactly 1 byte
      expect(tampered.rawBody).not.toEqual(original.rawBody);
      expect(tampered.rawBody.length).toBe(original.rawBody.length);
      expect(tampered.rawBody[0]).toBe(original.rawBody[0] ^ 0x01);

      // Original must remain unaffected (immutability)
      expect(verify(original)).toBe(true);

      // Tampered payload must FAIL cryptographic verification
      expect(verify(tampered)).toBe(false);

      // Independent manual HMAC verification should also fail
      const baseString = `${tampered.timestamp}.${tampered.rawBody.toString('utf8')}`;
      const actualHmac = createHmac('sha256', tampered.secret)
        .update(baseString)
        .digest('hex');
      const sigInHeader = tampered.headers['stripe-signature'].split('v1=')[1];
      expect(sigInHeader).not.toBe(actualHmac);
    });

    it('mutates GitHub payload raw bytes and causes verification to fail', () => {
      const original = sign('github');
      expect(verify(original)).toBe(true);

      const tampered = tamper(original);

      expect(tampered.headers['x-hub-signature-256']).toBe(
        original.headers['x-hub-signature-256']
      );
      expect(verify(tampered)).toBe(false);

      // Independent check
      const actualHmac = createHmac('sha256', tampered.secret)
        .update(tampered.rawBody)
        .digest('hex');
      const sigInHeader = tampered.headers['x-hub-signature-256'].slice('sha256='.length);
      expect(sigInHeader).not.toBe(actualHmac);
    });

    it('mutates Standard Webhook payload and causes verification to fail', () => {
      const original = sign('standard');
      expect(verify(original)).toBe(true);

      const tampered = tamper(original);

      expect(tampered.headers['webhook-signature']).toBe(
        original.headers['webhook-signature']
      );
      expect(verify(tampered)).toBe(false);
    });

    it('mutates Shopify payload raw body and causes verification to fail', () => {
      const original = sign('shopify');
      expect(verify(original)).toBe(true);

      const tampered = tamper(original);

      expect(tampered.headers['X-Shopify-Hmac-Sha256']).toBe(
        original.headers['X-Shopify-Hmac-Sha256']
      );
      expect(verify(tampered)).toBe(false);
    });

    it('mutates Slack payload raw body and causes verification to fail', () => {
      const original = sign('slack');
      expect(verify(original)).toBe(true);

      const tampered = tamper(original);

      expect(tampered.headers['X-Slack-Signature']).toBe(
        original.headers['X-Slack-Signature']
      );
      expect(verify(tampered)).toBe(false);
    });
  });

  describe('replay()', () => {
    it('preserves identical timestamp and signature headers across all providers', () => {
      const providers = ['stripe', 'github', 'standard', 'shopify', 'slack'] as const;

      for (const provider of providers) {
        const original = sign(provider);
        const replayed = replay(original);

        expect(replayed.timestamp).toBe(original.timestamp);
        expect(replayed.secret).toBe(original.secret);
        expect(replayed.event).toBe(original.event);
        expect(replayed.headers).toEqual(original.headers);
        expect(replayed.rawBody).toEqual(original.rawBody);

        // Verification still succeeds on replayed payload
        expect(verify(replayed)).toBe(true);
      }
    });

    it('returns a detached buffer copy to prevent cross-mutation', () => {
      const original = sign('shopify');
      const replayed = replay(original);

      expect(replayed.rawBody).not.toBe(original.rawBody);
      expect(replayed.rawBody.equals(original.rawBody)).toBe(true);
    });
  });

  describe('skew()', () => {
    it('recalculates Stripe signature with a stale timestamp', () => {
      const original = sign('stripe');
      const secondsAgo = 600; // 10 minutes ago
      const skewed = skew(original, secondsAgo);

      const expectedStaleTimestamp = original.timestamp - secondsAgo;
      expect(skewed.timestamp).toBe(expectedStaleTimestamp);

      // Signature header must be updated with the stale timestamp
      const match = skewed.headers['stripe-signature'].match(/^t=(\d+),v1=([a-f0-9]{64})$/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(expectedStaleTimestamp);

      // Verify the signature is valid for that stale timestamp
      const baseString = `${expectedStaleTimestamp}.${skewed.rawBody.toString('utf8')}`;
      const expectedHex = createHmac('sha256', skewed.secret)
        .update(baseString)
        .digest('hex');
      expect(match![2]).toBe(expectedHex);

      // Cryptographically valid without tolerance check
      expect(verify(skewed)).toBe(true);

      // Should FAIL when tolerance check is applied (e.g. max 300s drift allowed)
      expect(verify(skewed, { toleranceSeconds: 300 })).toBe(false);
    });

    it('recalculates Standard Webhooks signature with stale timestamp and header', () => {
      const original = sign('standard');
      const secondsAgo = 900; // 15 minutes ago
      const skewed = skew(original, secondsAgo);

      const expectedStaleTimestamp = original.timestamp - secondsAgo;
      expect(skewed.timestamp).toBe(expectedStaleTimestamp);
      expect(skewed.headers['webhook-timestamp']).toBe(String(expectedStaleTimestamp));

      const id = skewed.headers['webhook-id'];
      const baseString = `${id}.${expectedStaleTimestamp}.${skewed.rawBody.toString('utf8')}`;
      const expectedBase64 = createHmac('sha256', skewed.secret)
        .update(baseString)
        .digest('base64');

      expect(skewed.headers['webhook-signature']).toBe(`v1,${expectedBase64}`);

      // Passes without timestamp limit, fails with 300s limit
      expect(verify(skewed)).toBe(true);
      expect(verify(skewed, { toleranceSeconds: 300 })).toBe(false);
    });

    it('recalculates Slack signature with stale timestamp and header', () => {
      const original = sign('slack');
      const secondsAgo = 600; // 10 minutes ago
      const skewed = skew(original, secondsAgo);

      const expectedStaleTimestamp = original.timestamp - secondsAgo;
      expect(skewed.timestamp).toBe(expectedStaleTimestamp);
      expect(skewed.headers['X-Slack-Request-Timestamp']).toBe(String(expectedStaleTimestamp));

      const baseString = `v0:${expectedStaleTimestamp}:${skewed.rawBody.toString('utf8')}`;
      const expectedHex = createHmac('sha256', skewed.secret)
        .update(baseString)
        .digest('hex');

      expect(skewed.headers['X-Slack-Signature']).toBe(`v0=${expectedHex}`);

      // Cryptographically valid without tolerance
      expect(verify(skewed)).toBe(true);
      // Fails with 300s tolerance
      expect(verify(skewed, { toleranceSeconds: 300 })).toBe(false);
    });
  });

  describe('chaos namespace export', () => {
    it('exports tamper, replay, and skew on chaos object', () => {
      expect(typeof chaos.tamper).toBe('function');
      expect(typeof chaos.replay).toBe('function');
      expect(typeof chaos.skew).toBe('function');

      const original = sign('shopify');
      const tampered = chaos.tamper(original);
      expect(verify(tampered)).toBe(false);

      const replayed = chaos.replay(original);
      expect(verify(replayed)).toBe(true);

      const slackOriginal = sign('slack');
      const skewed = chaos.skew(slackOriginal, 600);
      expect(verify(skewed, { toleranceSeconds: 60 })).toBe(false);
    });
  });
});
