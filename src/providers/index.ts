import type { ProviderDefinition, ProviderName } from '../types.js';
import { stripeProvider } from './stripe.js';
import { githubProvider } from './github.js';
import { standardProvider } from './standard.js';

export const providers: Record<ProviderName, ProviderDefinition> = {
  stripe: stripeProvider,
  github: githubProvider,
  standard: standardProvider,
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
