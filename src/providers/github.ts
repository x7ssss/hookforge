import { createHmac } from 'node:crypto';
import type { ProviderDefinition } from '../types.js';

export const GITHUB_DEFAULT_SECRET = 'gh_secret_test';
export const GITHUB_DEFAULT_EVENT = 'push';

export const githubFixtures: Record<string, unknown> = {
  push: {
    ref: 'refs/heads/main',
    before: '0000000000000000000000000000000000000000',
    after: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
    repository: {
      id: 1296269,
      name: 'hookforge',
      full_name: 'octocat/hookforge',
      private: false,
      owner: {
        name: 'octocat',
        email: 'octocat@github.com',
      },
    },
    pusher: {
      name: 'octocat',
      email: 'octocat@github.com',
    },
    sender: {
      login: 'octocat',
      id: 1,
    },
    commits: [
      {
        id: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
        message: 'feat: initial commit',
        timestamp: '2026-09-16T00:00:00Z',
        author: {
          name: 'octocat',
          email: 'octocat@github.com',
        },
      },
    ],
  },
};

export function getGithubFixture(event: string = GITHUB_DEFAULT_EVENT): unknown {
  if (githubFixtures[event]) {
    return githubFixtures[event];
  }
  return {
    action: 'opened',
    event,
    repository: {
      id: 1296269,
      name: 'hookforge',
      full_name: 'octocat/hookforge',
    },
    sender: {
      login: 'octocat',
      id: 1,
    },
  };
}

export function computeGithubSignature(secret: string, rawBody: Buffer): string {
  const hmacHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${hmacHex}`;
}

export const githubProvider: ProviderDefinition = {
  name: 'github',
  defaultSecret: GITHUB_DEFAULT_SECRET,
  defaultEvent: GITHUB_DEFAULT_EVENT,
  getFixture: getGithubFixture,
  sign({ rawBody, secret, event }) {
    const signature = computeGithubSignature(secret, rawBody);
    return {
      'x-hub-signature-256': signature,
      'x-github-event': event,
      'content-type': 'application/json',
    };
  },
};
