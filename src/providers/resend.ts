import { createHmac, randomBytes } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const RESEND_DEFAULT_SECRET = 'whsec_test';
export const RESEND_DEFAULT_EVENT = 'email.sent';

export const resendFixtures: Record<string, unknown> = {
  'email.sent': {
    type: 'email.sent',
    created_at: '2026-09-16T08:00:00.000Z',
    data: {
      email_id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
      from: 'Acme <onboarding@resend.dev>',
      to: ['delivered@resend.dev'],
      subject: 'Welcome to HookForge!',
      created_at: '2026-09-16T08:00:00.000Z',
    },
  },
  'email.delivered': {
    type: 'email.delivered',
    created_at: '2026-09-16T08:01:00.000Z',
    data: {
      email_id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
      from: 'Acme <onboarding@resend.dev>',
      to: ['delivered@resend.dev'],
      subject: 'Welcome to HookForge!',
      created_at: '2026-09-16T08:00:00.000Z',
    },
  },
  'email.bounced': {
    type: 'email.bounced',
    created_at: '2026-09-16T08:02:00.000Z',
    data: {
      email_id: 'd04e578c-0ce1-4ea6-ab68-afcd6dc2e794',
      from: 'Acme <onboarding@resend.dev>',
      to: ['bounced@resend.dev'],
      subject: 'Welcome to HookForge!',
      bounce: {
        message: 'Mailbox does not exist',
        type: 'permanent',
      },
      created_at: '2026-09-16T08:02:00.000Z',
    },
  },
};

export function getResendFixture(event: string = RESEND_DEFAULT_EVENT): unknown {
  if (resendFixtures[event]) {
    return resendFixtures[event];
  }
  return {
    type: event,
    created_at: new Date().toISOString(),
    data: {
      email_id: `msg_${Date.now()}`,
      created_at: new Date().toISOString(),
    },
  };
}

export function generateResendMessageId(): string {
  return `msg_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export function computeResendSignature(
  id: string,
  timestamp: number,
  rawBody: Buffer,
  secret: string
): string {
  const baseString = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  const base64 = createHmac('sha256', secret).update(baseString).digest('base64');
  return `v1,${base64}`;
}

export const resendProvider: ProviderDefinition = {
  name: 'resend',
  defaultSecret: RESEND_DEFAULT_SECRET,
  defaultEvent: RESEND_DEFAULT_EVENT,
  getFixture: getResendFixture,
  sign({ rawBody, secret, timestamp, id = generateResendMessageId() }) {
    const signature = computeResendSignature(id, timestamp, rawBody, secret);
    return {
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': signature,
      'content-type': 'application/json',
    };
  },
};
