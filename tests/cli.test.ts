import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { runCli } from '../src/cli.js';

describe('CLI - src/cli.ts', () => {
  let server: Server;
  let serverPort: number;
  const receivedRequests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({ headers: req.headers, body: data });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('prints help and exits with 0 on --help', async () => {
    const code = await runCli(['--help']);
    expect(code).toBe(0);
  });

  it('prints version and exits with 0 on --version', async () => {
    const code = await runCli(['--version']);
    expect(code).toBe(0);
  });

  it('exits with 1 when provider is missing or invalid', async () => {
    const code = await runCli(['invalid_provider', '--to', 'http://localhost:3000']);
    expect(code).toBe(1);
  });

  it('exits with 1 when --to is missing', async () => {
    const code = await runCli(['stripe', 'payment_intent.succeeded']);
    expect(code).toBe(1);
  });

  it('sends webhook to target URL and returns exit code 0', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli(['stripe', 'payment_intent.succeeded', '--to', target]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['stripe-signature']).toBeDefined();
  });

  it('sends both original and replayed payloads when --replay is used', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli([
      'standard',
      'user.created',
      '--to',
      target,
      '--replay',
    ]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(2);

    // Both requests must have identical webhook-signature and webhook-id
    const firstReq = receivedRequests[0];
    const secondReq = receivedRequests[1];
    expect(firstReq.headers['webhook-signature']).toBe(
      secondReq.headers['webhook-signature']
    );
    expect(firstReq.headers['webhook-id']).toBe(secondReq.headers['webhook-id']);
    expect(firstReq.headers['webhook-timestamp']).toBe(
      secondReq.headers['webhook-timestamp']
    );
  });

  it('sends tampered body when --tamper is used', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli([
      'github',
      'push',
      '--to',
      target,
      '--tamper',
    ]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['x-hub-signature-256']).toBeDefined();
  });
});
