import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { sign, send } from '../src/index.js';

describe('Send Engine - src/send.ts', () => {
  let server: Server;
  let serverPort: number;
  let lastReceived: {
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
  } | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        lastReceived = {
          headers: req.headers,
          body: Buffer.concat(chunks),
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
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

  it('POSTs Stripe webhook with accurate Content-Length and signature headers', async () => {
    const signed = sign('stripe');
    const url = `http://127.0.0.1:${serverPort}/webhook`;

    const res = await send(signed, url);

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);

    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);

    expect(lastReceived).not.toBeNull();
    expect(lastReceived!.headers['stripe-signature']).toBe(
      signed.headers['stripe-signature']
    );
    expect(lastReceived!.headers['content-length']).toBe(
      String(signed.rawBody.byteLength)
    );
    expect(lastReceived!.headers['content-type']).toBe('application/json');
    expect(lastReceived!.body.equals(signed.rawBody)).toBe(true);
  });

  it('POSTs GitHub webhook with x-hub-signature-256 and event header', async () => {
    const signed = sign('github');
    const url = `http://127.0.0.1:${serverPort}/webhook`;

    const res = await send(signed, url);

    expect(res.status).toBe(200);
    expect(lastReceived!.headers['x-hub-signature-256']).toBe(
      signed.headers['x-hub-signature-256']
    );
    expect(lastReceived!.headers['x-github-event']).toBe('push');
    expect(lastReceived!.headers['content-length']).toBe(
      String(signed.rawBody.byteLength)
    );
    expect(lastReceived!.body.equals(signed.rawBody)).toBe(true);
  });

  it('POSTs Standard webhook with webhook-* headers', async () => {
    const signed = sign('standard');
    const url = `http://127.0.0.1:${serverPort}/webhook`;

    const res = await send(signed, url);

    expect(res.status).toBe(200);
    expect(lastReceived!.headers['webhook-signature']).toBe(
      signed.headers['webhook-signature']
    );
    expect(lastReceived!.headers['webhook-id']).toBe(signed.headers['webhook-id']);
    expect(lastReceived!.headers['webhook-timestamp']).toBe(
      signed.headers['webhook-timestamp']
    );
    expect(lastReceived!.headers['content-length']).toBe(
      String(signed.rawBody.byteLength)
    );
    expect(lastReceived!.body.equals(signed.rawBody)).toBe(true);
  });

  it('supports send(url, signedPayload) parameter order and normalizes URL without scheme', async () => {
    const signed = sign('stripe');
    // Notice lack of http:// prefix
    const urlWithoutScheme = `127.0.0.1:${serverPort}/webhook`;

    const res = await send(urlWithoutScheme, signed);

    expect(res.status).toBe(200);
    expect(lastReceived!.headers['stripe-signature']).toBe(
      signed.headers['stripe-signature']
    );
    expect(lastReceived!.body.equals(signed.rawBody)).toBe(true);
  });
});
