export type ProviderName = 'stripe' | 'github' | 'standard';

export interface WebhookOptions {
  event?: string;
  secret?: string;
  payload?: unknown | string | Buffer;
  body?: unknown | string | Buffer;
  timestamp?: number;
  id?: string;
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
  }): Record<string, string>;
}
