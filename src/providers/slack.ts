import { createHmac } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const SLACK_DEFAULT_SECRET = 'slack_signing_secret_test';
export const SLACK_DEFAULT_EVENT = 'app_mention';

export const slackFixtures: Record<string, unknown> = {
  app_mention: {
    token: 'ZZZZZZWSxiZZZ2yIvs3peJ',
    team_id: 'T061EG9R2',
    api_app_id: 'A0FFV41KK',
    event: {
      type: 'app_mention',
      user: 'U061F7AUR',
      text: '<@U0LAN0Z89> Can you verify this webhook signature?',
      ts: '1718000000.000200',
      channel: 'C0LAN2Q65',
      event_ts: '1718000000.000200',
    },
    type: 'event_callback',
    event_id: 'Ev08MD1920',
    event_time: 1718000000,
    authed_users: ['U0LAN0Z89'],
  },
};

export function getSlackFixture(event: string = SLACK_DEFAULT_EVENT): unknown {
  if (slackFixtures[event]) {
    return slackFixtures[event];
  }
  return {
    token: 'ZZZZZZWSxiZZZ2yIvs3peJ',
    team_id: 'T061EG9R2',
    api_app_id: 'A0FFV41KK',
    event: {
      type: event,
      user: 'U061F7AUR',
      text: `Triggered ${event}`,
      ts: `${Math.floor(Date.now() / 1000)}.000100`,
    },
    type: 'event_callback',
    event_id: `Ev_${Date.now()}`,
    event_time: Math.floor(Date.now() / 1000),
  };
}

export function computeSlackSignature(
  secret: string,
  timestamp: number,
  rawBody: Buffer
): string {
  const baseString = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const hmacHex = createHmac('sha256', secret).update(baseString).digest('hex');
  return `v0=${hmacHex}`;
}

export const slackProvider: ProviderDefinition = {
  name: 'slack',
  defaultSecret: SLACK_DEFAULT_SECRET,
  defaultEvent: SLACK_DEFAULT_EVENT,
  getFixture: getSlackFixture,
  sign({ rawBody, secret, timestamp }) {
    const signature = computeSlackSignature(secret, timestamp, rawBody);
    return {
      'X-Slack-Signature': signature,
      'X-Slack-Request-Timestamp': String(timestamp),
      'content-type': 'application/json',
    };
  },
};
