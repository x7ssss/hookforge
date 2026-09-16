import { createHmac } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const TWILIO_DEFAULT_SECRET = 'twilio_auth_token_test';
export const TWILIO_DEFAULT_EVENT = 'message.received';

export const twilioFixtures: Record<string, unknown> = {
  'message.received': {
    MessageSid: 'SM_test_message_sid_hookforge',
    AccountSid: 'AC_test_account_sid_hookforge',
    From: '+15017122661',
    To: '+15558675310',
    Body: 'Hello from HookForge!',
    NumMedia: '0',
    NumSegments: '1',
    SmsStatus: 'received',
  },
  'call.completed': {
    CallSid: 'CA_test_call_sid_hookforge',
    AccountSid: 'AC_test_account_sid_hookforge',
    From: '+15017122661',
    To: '+15558675310',
    CallStatus: 'completed',
    CallDuration: '42',
    Direction: 'inbound',
  },
};

export function getTwilioFixture(event: string = TWILIO_DEFAULT_EVENT): unknown {
  if (twilioFixtures[event]) {
    return twilioFixtures[event];
  }
  return {
    Sid: `sid_${Date.now()}`,
    Event: event,
    AccountSid: 'AC_test_account_sid_hookforge',
    Status: 'completed',
  };
}

export function extractSortedParams(rawBody: Buffer): string {
  const str = rawBody.toString('utf8').trim();
  if (!str) return '';

  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed).sort();
      return keys
        .map((k) => `${k}${parsed[k] !== undefined && parsed[k] !== null ? String(parsed[k]) : ''}`)
        .join('');
    }
  } catch {
    // If not JSON, check for URL-encoded form parameters
    if (str.includes('=')) {
      const params = new URLSearchParams(str);
      const keys = Array.from(new Set(params.keys())).sort();
      return keys.map((k) => `${k}${params.get(k) || ''}`).join('');
    }
  }

  return str;
}

export function computeTwilioSignature(
  secret: string,
  targetUrl: string,
  rawBody: Buffer
): string {
  const sortedParams = extractSortedParams(rawBody);
  const baseString = `${targetUrl}${sortedParams}`;
  return createHmac('sha1', secret).update(baseString).digest('base64');
}

export const twilioProvider: ProviderDefinition = {
  name: 'twilio',
  defaultSecret: TWILIO_DEFAULT_SECRET,
  defaultEvent: TWILIO_DEFAULT_EVENT,
  getFixture: getTwilioFixture,
  sign({ rawBody, secret, targetUrl = 'http://localhost:3000/api/webhooks' }) {
    const signature = computeTwilioSignature(secret, targetUrl, rawBody);
    return {
      'X-Twilio-Signature': signature,
      'content-type': 'application/json',
    };
  },
};
