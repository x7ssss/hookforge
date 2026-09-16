import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable, PassThrough } from 'node:stream';
import { runCli, readStdin } from '../src/cli.js';
import { verify, STRIPE_DEFAULT_SECRET } from '../src/index.js';

describe('CLI - src/cli.ts', () => {
  let server: Server;
  let serverPort: number;
  const receivedRequests: Array<{
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }> = [];

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

  it('prints version 0.2.0 and exits with 0 on --version', async () => {
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

  it('sends shopify orders/create webhook via CLI', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli(['shopify', 'orders/create', '--to', target]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['x-shopify-hmac-sha256']).toBeDefined();
    expect(receivedRequests[0].headers['x-shopify-topic']).toBe('orders/create');
  });

  it('sends slack app_mention webhook via CLI', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli(['slack', 'app_mention', '--to', target]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['x-slack-signature']).toBeDefined();
    expect(receivedRequests[0].headers['x-slack-request-timestamp']).toBeDefined();
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

  it('sends custom inline json payload via --data', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;
    const customData = JSON.stringify({ custom_event: true, value: 42 });

    const code = await runCli([
      'stripe',
      'custom.event',
      '--to',
      target,
      '--data',
      customData,
    ]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].body).toBe(customData);
  });

  it('readStdin returns undefined cleanly when stdin is empty or unpiped', async () => {
    const result = await readStdin(10);
    expect(result).toBeUndefined();
  });

  it('reads payload from stdin when --data - is passed', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;
    const pipedData = JSON.stringify({ from_stdin: true, amount: 999 });

    process.nextTick(() => {
      process.stdin.push(pipedData);
      process.stdin.push(null);
    });

    const code = await runCli([
      'stripe',
      'payment_intent.succeeded',
      '--to',
      target,
      '--data',
      '-',
    ]);

    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].body).toBe(pipedData);
  });

  it('sends custom inline json payload via -d short flag with exact signature bytes', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;
    const customJson = '{\n  "custom_field":   "unformatted_spacing",\n  "num": 42\n}';

    const code = await runCli([
      'stripe',
      'payment_intent.succeeded',
      '--to',
      target,
      '-d',
      customJson,
    ]);

    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].body).toBe(customJson);

    // Cryptographic verification must succeed on the EXACT received bytes
    const req = receivedRequests[0];
    const verified = verify({
      headers: req.headers as Record<string, string>,
      rawBody: Buffer.from(req.body, 'utf8'),
      secret: STRIPE_DEFAULT_SECRET,
      provider: 'stripe',
    });
    expect(verified).toBe(true);
  });

  it('reads custom JSON payload from file using --file and -f flags', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;
    const tempFile = join(process.cwd(), 'temp-test-payload.json');
    const fileContent = JSON.stringify({ from_file: true, order_id: 'ord_9876' });
    writeFileSync(tempFile, fileContent, 'utf8');

    try {
      // Test relative path via -f
      const codeRel = await runCli([
        'stripe',
        'payment_intent.succeeded',
        '--to',
        target,
        '-f',
        'temp-test-payload.json',
      ]);
      expect(codeRel).toBe(0);
      expect(receivedRequests.length).toBe(1);
      expect(receivedRequests[0].body).toBe(fileContent);

      // Test absolute path via --file
      receivedRequests.length = 0;
      const codeAbs = await runCli([
        'stripe',
        'payment_intent.succeeded',
        '--to',
        target,
        '--file',
        tempFile,
      ]);
      expect(codeAbs).toBe(0);
      expect(receivedRequests.length).toBe(1);
      expect(receivedRequests[0].body).toBe(fileContent);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch {}
    }
  });

  it('exits with 1 when payload file does not exist', async () => {
    const target = `http://127.0.0.1:${serverPort}/webhook`;
    const code = await runCli([
      'stripe',
      'payment_intent.succeeded',
      '--to',
      target,
      '--file',
      'non-existent-payload-file.json',
    ]);
    expect(code).toBe(1);
  });

  it('supports multiple custom headers using -H and --header', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli([
      'github',
      'push',
      '--to',
      target,
      '-H',
      'Authorization: Bearer test-secret-token',
      '--header',
      'X-Custom-Env: staging',
      '-H',
      'X-Request-Id: req_xyz_123',
    ]);

    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    const headers = receivedRequests[0].headers;
    expect(headers['authorization']).toBe('Bearer test-secret-token');
    expect(headers['x-custom-env']).toBe('staging');
    expect(headers['x-request-id']).toBe('req_xyz_123');
    expect(headers['x-hub-signature-256']).toBeDefined();
  });

  it('sends paddle subscription.created webhook via CLI', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli(['paddle', 'subscription.created', '--to', target]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['paddle-signature']).toBeDefined();
  });

  it('sends resend email.sent webhook via CLI', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli(['resend', 'email.sent', '--to', target]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['svix-signature']).toBeDefined();
    expect(receivedRequests[0].headers['svix-id']).toBeDefined();
    expect(receivedRequests[0].headers['svix-timestamp']).toBeDefined();
  });

  it('sends twilio message.received webhook via CLI', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    const code = await runCli(['twilio', 'message.received', '--to', target]);
    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['x-twilio-signature']).toBeDefined();
  });

  it('runs interactive terminal wizard when invoked with no CLI arguments', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    // Responses for interactive wizard:
    // 1. Select provider: paddle
    // 2. Select event: 1 (subscription.created)
    // 3. Target URL: target
    // 4. Secret: empty string (default)
    // 5. Tamper: n
    const answers = ['paddle', '1', target, '', 'n'];
    let answerIdx = 0;

    const stdinStream = new PassThrough();
    const stdoutChunks: string[] = [];
    const stdoutStream = new Writable({
      write(chunk, encoding, callback) {
        const text = chunk.toString();
        stdoutChunks.push(text);
        if (text.includes(': ') && answerIdx < answers.length) {
          const ans = answers[answerIdx++];
          setTimeout(() => stdinStream.write(ans + '\n'), 5);
        }
        callback();
      },
    });

    const code = await runCli([], {
      isTTY: true,
      stdin: stdinStream,
      stdout: stdoutStream,
    });

    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['paddle-signature']).toBeDefined();
    const stdoutText = stdoutChunks.join('');
    expect(stdoutText).toContain('PADDLE');
    expect(stdoutText).toContain('subscription.created');
  });

  it('runs interactive terminal wizard with tamper enabled', async () => {
    receivedRequests.length = 0;
    const target = `http://127.0.0.1:${serverPort}/webhook`;

    // 1. Select provider: 1 (stripe)
    // 2. Select event: 1 (payment_intent.succeeded)
    // 3. Target URL: target
    // 4. Secret: empty string (default)
    // 5. Tamper: y
    const answers = ['1', '1', target, '', 'y'];
    let answerIdx = 0;

    const stdinStream = new PassThrough();
    const stdoutChunks: string[] = [];
    const stdoutStream = new Writable({
      write(chunk, encoding, callback) {
        const text = chunk.toString();
        stdoutChunks.push(text);
        if (text.includes(': ') && answerIdx < answers.length) {
          const ans = answers[answerIdx++];
          setTimeout(() => stdinStream.write(ans + '\n'), 5);
        }
        callback();
      },
    });

    const code = await runCli([], {
      isTTY: true,
      stdin: stdinStream,
      stdout: stdoutStream,
    });

    expect(code).toBe(0);
    expect(receivedRequests.length).toBe(1);
    expect(receivedRequests[0].headers['stripe-signature']).toBeDefined();
    const stdoutText = stdoutChunks.join('');
    expect(stdoutText).toContain('[TAMPERED]');
  });
});
