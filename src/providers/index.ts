import type { ProviderDefinition, ProviderName } from '../types.js';
import { stripeProvider } from './stripe.js';
import { githubProvider } from './github.js';
import { standardProvider } from './standard.js';
import { shopifyProvider } from './shopify.js';
import { slackProvider } from './slack.js';
import { paddleProvider } from './paddle.js';
import { resendProvider } from './resend.js';
import { twilioProvider } from './twilio.js';

export const providers: Record<ProviderName, ProviderDefinition> = {
  stripe: stripeProvider,
  github: githubProvider,
  standard: standardProvider,
  shopify: shopifyProvider,
  slack: slackProvider,
  paddle: paddleProvider,
  resend: resendProvider,
  twilio: twilioProvider,
  svix: standardProvider,
};

export function getProvider(name: ProviderName): ProviderDefinition {
  const provider = providers[name];
  if (!provider) {
    throw new Error(
      `Unsupported provider "${name}". Supported providers are: ${Object.keys(providers).join(', ')}`
    );
  }
  return provider;
}

export * from './stripe.js';
export * from './github.js';
export * from './standard.js';
export * from './shopify.js';
export * from './slack.js';
export * from './paddle.js';
export * from './resend.js';
export * from './twilio.js';
