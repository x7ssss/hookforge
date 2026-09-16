export type ProviderName =
  | 'stripe'
  | 'github'
  | 'standard'
  | 'shopify'
  | 'slack'
  | 'paddle'
  | 'resend'
  | 'twilio'
  | 'svix';

export interface WebhookOptions {
  event?: string;
  secret?: string;
  payload?: unknown | string | Buffer;
  body?: unknown | string | Buffer;
  timestamp?: number;
  id?: string;
  targetUrl?: string;
  url?: string;
  [key: string]: unknown;
}

export interface SignedPayload {
  headers: Record<string, string>;
  rawBody: Buffer;
  secret: string;
  event: string;
  timestamp: number;
  provider?: ProviderName;
  id?: string;
  targetUrl?: string;
}

export interface ProviderDefinition {
  name: ProviderName;
  defaultSecret: string;
  defaultEvent: string;
  getFixture(event: string): unknown;
  sign(options: {
    rawBody: Buffer;
    secret: string;
    timestamp: number;
    event: string;
    id?: string;
    targetUrl?: string;
  }): Record<string, string>;
}
