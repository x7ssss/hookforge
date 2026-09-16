import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { sign } from './sign.js';
import { tamper as chaosTamper, replay as chaosReplay, skew as chaosSkew } from './chaos.js';
import { send } from './send.js';
import { providers, getProvider } from './providers/index.js';
import type { ProviderName, SignedPayload } from './types.js';

// ANSI escape codes for zero-dependency terminal styling
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

export const INTERACTIVE_PROVIDERS = [
  'stripe',
  'github',
  'shopify',
  'svix',
  'slack',
  'paddle',
  'resend',
  'twilio',
] as const;

export const DEFAULT_PROVIDER_EVENTS: Record<string, string[]> = {
  stripe: [
    'payment_intent.succeeded',
    'customer.subscription.deleted',
    'invoice.payment_failed',
  ],
  github: ['push', 'pull_request'],
  shopify: ['orders/create'],
  svix: ['user.created'],
  slack: ['app_mention'],
  paddle: ['subscription.created', 'transaction.completed'],
  resend: ['email.sent', 'email.delivered', 'email.bounced'],
  twilio: ['message.received', 'call.completed'],
};

function formatStatus(status: number, statusText: string): string {
  const label = `${status}${statusText ? ` ${statusText}` : ''}`;
  if (status >= 200 && status < 300) {
    return `${c.green}${c.bold}${label}${c.reset}`;
  }
  if (status >= 300 && status < 400) {
    return `${c.yellow}${c.bold}${label}${c.reset}`;
  }
  return `${c.red}${c.bold}${label}${c.reset}`;
}

function printStatusOutput(
  params: {
    timestamp: string;
    provider: string;
    event: string;
    targetUrl: string;
    payloadSize: number;
    statusCode: number;
    statusText: string;
    isReplay?: boolean;
    isTampered?: boolean;
    isSkewed?: boolean;
  },
  output?: NodeJS.WritableStream
): void {
  const replayTag = params.isReplay ? ` ${c.magenta}[REPLAY]${c.reset}` : '';
  const tamperTag = params.isTampered ? ` ${c.yellow}[TAMPERED]${c.reset}` : '';
  const skewTag = params.isSkewed ? ` ${c.yellow}[SKEWED]${c.reset}` : '';

  const line1 = `${c.gray}[${params.timestamp}]${c.reset} ${c.cyan}${c.bold}${params.provider.toUpperCase()}${c.reset} ${c.bold}${params.event}${c.reset}${replayTag}${tamperTag}${skewTag}`;
  const line2 = `  ${c.dim}Target:${c.reset}       ${params.targetUrl}`;
  const line3 = `  ${c.dim}Payload Size:${c.reset} ${params.payloadSize} bytes`;
  const line4 = `  ${c.dim}HTTP Status:${c.reset}  ${formatStatus(params.statusCode, params.statusText)}`;

  if (output && output !== process.stdout) {
    output.write(`${line1}\n${line2}\n${line3}\n${line4}\n`);
  } else {
    console.log(line1);
    console.log(line2);
    console.log(line3);
    console.log(line4);
  }
}

function printHelp(): void {
  console.log(`
${c.bold}hookforge${c.reset} - Provider-accurate webhook traffic on your laptop

${c.bold}USAGE:${c.reset}
  hookforge <provider> <event> --to <target_url> [options]
  cat payload.json | hookforge <provider> <event> --to <target_url>
  hookforge (runs interactive wizard when invoked with no arguments)

${c.bold}ARGUMENTS:${c.reset}
  <provider>            Provider name (${c.cyan}stripe${c.reset} | ${c.cyan}github${c.reset} | ${c.cyan}shopify${c.reset} | ${c.cyan}svix${c.reset} | ${c.cyan}standard${c.reset} | ${c.cyan}slack${c.reset} | ${c.cyan}paddle${c.reset} | ${c.cyan}resend${c.reset} | ${c.cyan}twilio${c.reset})
  <event>               Event name (e.g. payment_intent.succeeded, push, orders/create, subscription.created, email.sent, message.received)

${c.bold}OPTIONS:${c.reset}
  --to <url>            Target URL to send webhook to (required)
  --secret <str>        Secret used to sign the webhook (default: provider default)
  --tamper              Mutate 1 byte in payload body to test signature rejection
  --replay              Send webhook then replay identical payload and headers
  --skew <seconds>      Recalculate signature with a stale timestamp (seconds ago)
  -d, --data <json>     Custom JSON string payload (or '-' to force reading from stdin)
  -f, --file <path>     Path to custom JSON payload file
  -H, --header <header> Custom HTTP header (can be repeated, e.g. -H "X-Custom: 123")
  -h, --help            Show this help message
  -v, --version         Show version
`);
}

/**
 * Reads standard input if piped or requested via --data -.
 * Falls back to undefined if stdin is empty or unpiped.
 */
export async function readStdin(timeoutMs = 50): Promise<string | undefined> {
  if (process.stdin.isTTY && timeoutMs > 0) {
    return undefined;
  }

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const chunks: Buffer[] = [];

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
      process.stdin.pause();
    };

    const onData = (chunk: Buffer) => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };

    const onEnd = () => {
      cleanup();
      const content = Buffer.concat(chunks).toString('utf8').trim();
      resolve(content.length > 0 ? content : undefined);
    };

    const onError = () => {
      cleanup();
      resolve(undefined);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (chunks.length === 0) {
          cleanup();
          resolve(undefined);
        }
      }, timeoutMs);
    }

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });
}

export interface InteractiveOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export async function runInteractiveMode(options: InteractiveOptions = {}): Promise<number> {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const rl = createInterface({ input, output });

  try {
    output.write(`\n${c.bold}hookforge${c.reset} - Interactive Webhook Wizard\n\n`);

    // 1. Select Provider (stripe, github, shopify, svix, slack, paddle, resend, twilio)
    output.write(`${c.bold}Select Provider:${c.reset}\n`);
    INTERACTIVE_PROVIDERS.forEach((p, idx) => {
      output.write(`  ${c.cyan}${idx + 1})${c.reset} ${p}\n`);
    });

    let selectedProvider: ProviderName | undefined;
    while (!selectedProvider) {
      const answer = (
        await rl.question(`\nEnter provider [1-${INTERACTIVE_PROVIDERS.length} or name] (default: stripe): `)
      ).trim().toLowerCase();

      if (!answer) {
        selectedProvider = 'stripe';
        break;
      }
      const num = parseInt(answer, 10);
      if (!isNaN(num) && num >= 1 && num <= INTERACTIVE_PROVIDERS.length) {
        selectedProvider = INTERACTIVE_PROVIDERS[num - 1] as ProviderName;
        break;
      }
      if (INTERACTIVE_PROVIDERS.includes(answer as any)) {
        selectedProvider = answer as ProviderName;
        break;
      }
      output.write(`${c.red}Invalid selection. Please enter 1-${INTERACTIVE_PROVIDERS.length} or provider name.${c.reset}\n`);
    }

    const providerDef = getProvider(selectedProvider);

    // 2. Select Event for that provider
    const availableEvents = DEFAULT_PROVIDER_EVENTS[selectedProvider] || [providerDef.defaultEvent];
    output.write(`\n${c.bold}Select Event for ${selectedProvider}:${c.reset}\n`);
    availableEvents.forEach((ev, idx) => {
      output.write(`  ${c.cyan}${idx + 1})${c.reset} ${ev}\n`);
    });

    let selectedEvent: string | undefined;
    while (!selectedEvent) {
      const answer = (
        await rl.question(`\nEnter event [1-${availableEvents.length} or custom] (default: ${availableEvents[0]}): `)
      ).trim();

      if (!answer) {
        selectedEvent = availableEvents[0];
        break;
      }
      const num = parseInt(answer, 10);
      if (!isNaN(num) && num >= 1 && num <= availableEvents.length) {
        selectedEvent = availableEvents[num - 1];
        break;
      }
      selectedEvent = answer;
      break;
    }

    // 3. Target URL (default: http://localhost:3000/api/webhooks)
    const urlAnswer = (
      await rl.question(`\nTarget URL (default: http://localhost:3000/api/webhooks): `)
    ).trim();
    const targetUrl = urlAnswer || 'http://localhost:3000/api/webhooks';

    // 4. Secret key (optional / default test secret)
    const secretAnswer = (
      await rl.question(`Secret key (optional, default: ${providerDef.defaultSecret}): `)
    ).trim();
    const secret = secretAnswer || providerDef.defaultSecret;

    // 5. Tamper test? (y/N)
    const tamperAnswer = (
      await rl.question(`Tamper test? (y/N): `)
    ).trim().toLowerCase();
    const isTampered = tamperAnswer === 'y' || tamperAnswer === 'yes';

    output.write('\n');

    // Fire the request and display the formatted output
    let payload = sign(selectedProvider, {
      event: selectedEvent,
      secret,
      targetUrl,
    });

    if (isTampered) {
      payload = chaosTamper(payload);
    }

    const isoTime = new Date().toISOString();
    try {
      const res = await send(payload, targetUrl);
      printStatusOutput(
        {
          timestamp: isoTime,
          provider: selectedProvider,
          event: selectedEvent,
          targetUrl,
          payloadSize: payload.rawBody.byteLength,
          statusCode: res.status,
          statusText: res.statusText,
          isTampered,
        },
        output
      );
      return 0;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `${c.red}Error sending webhook to ${targetUrl}:${c.reset} ${message}`
      );
      return 1;
    }
  } finally {
    rl.close();
  }
}

export interface CliOptions {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  isTTY?: boolean;
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  cliOptions?: CliOptions
): Promise<number> {
  const isTTY =
    cliOptions?.isTTY !== undefined
      ? cliOptions.isTTY
      : Boolean(process.stdin.isTTY);

  // When hookforge is invoked with no CLI arguments and non-piped stdin/tty, run interactive terminal prompt
  if (argv.length === 0 && isTTY) {
    return await runInteractiveMode({
      input: cliOptions?.stdin,
      output: cliOptions?.stdout,
    });
  }

  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      to: { type: 'string' },
      secret: { type: 'string' },
      tamper: { type: 'boolean', default: false },
      replay: { type: 'boolean', default: false },
      skew: { type: 'string' },
      data: { type: 'string', short: 'd' },
      file: { type: 'string', short: 'f' },
      header: { type: 'string', short: 'H', multiple: true },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.version) {
    console.log('0.3.0');
    return 0;
  }

  if (values.help || positionals.length === 0) {
    printHelp();
    return 0;
  }

  const rawProvider = positionals[0]?.toLowerCase();
  const provider = rawProvider as ProviderName;

  if (!provider || !providers[provider]) {
    console.error(
      `${c.red}Error:${c.reset} Invalid or missing provider "${rawProvider}". Supported providers: stripe, github, standard, shopify, slack, paddle, resend, twilio, svix`
    );
    return 1;
  }

  const defaultEvent = providers[provider].defaultEvent;
  const event = positionals[1] || defaultEvent;
  const targetUrl = typeof values.to === 'string' ? values.to : undefined;

  if (!targetUrl) {
    console.error(
      `${c.red}Error:${c.reset} Missing required option: --to <target_url>`
    );
    console.error(
      `Usage: hookforge ${provider} ${event} --to <target_url> [--secret <str>] [--tamper] [--replay]`
    );
    return 1;
  }

  // Handle stdin payload piping or --data / --file arguments
  let rawData: string | undefined;
  if (values.data === '-') {
    rawData = await readStdin(0);
  } else if (typeof values.data === 'string') {
    rawData = values.data;
  } else if (typeof values.file === 'string') {
    try {
      const filePath = resolve(process.cwd(), values.file);
      rawData = readFileSync(filePath, 'utf8');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `${c.red}Error reading payload file "${values.file}":${c.reset} ${message}`
      );
      return 1;
    }
  } else if (!process.stdin.isTTY) {
    rawData = await readStdin(50);
  }

  // Parse custom headers from -H / --header
  const customHeaders: Record<string, string> = {};
  if (Array.isArray(values.header)) {
    for (const item of values.header) {
      if (typeof item === 'string') {
        const colonIdx = item.indexOf(':');
        if (colonIdx !== -1) {
          const key = item.slice(0, colonIdx).trim();
          const val = item.slice(colonIdx + 1).trim();
          if (key) {
            customHeaders[key] = val;
          }
        }
      }
    }
  }

  // Cryptographic signatures must always be calculated against the resolved payload bytes (custom or template)
  const customPayload = rawData !== undefined && rawData.length > 0 ? rawData : undefined;
  const secret = typeof values.secret === 'string' ? values.secret : undefined;

  // Generate signed payload
  let payload: SignedPayload = sign(provider, {
    event,
    secret,
    payload: customPayload,
    targetUrl,
  });

  const isTampered = Boolean(values.tamper);
  const isSkewed = Boolean(values.skew);
  const isReplay = Boolean(values.replay);

  if (isSkewed) {
    const rawSkew = typeof values.skew === 'string' ? values.skew : '300';
    const seconds = parseInt(rawSkew, 10) || 300;
    payload = chaosSkew(payload, seconds);
  }

  if (isTampered) {
    payload = chaosTamper(payload);
  }

  // Send primary payload
  const isoTime = new Date().toISOString();
  try {
    const res = await send(payload, targetUrl, { headers: customHeaders });
    printStatusOutput({
      timestamp: isoTime,
      provider,
      event,
      targetUrl,
      payloadSize: payload.rawBody.byteLength,
      statusCode: res.status,
      statusText: res.statusText,
      isTampered,
      isSkewed,
    });

    // If --replay is requested, send the replayed payload
    if (isReplay) {
      const replayedPayload = chaosReplay(payload);
      const replayTime = new Date().toISOString();
      const replayRes = await send(replayedPayload, targetUrl, { headers: customHeaders });
      printStatusOutput({
        timestamp: replayTime,
        provider,
        event,
        targetUrl,
        payloadSize: replayedPayload.rawBody.byteLength,
        statusCode: replayRes.status,
        statusText: replayRes.statusText,
        isReplay: true,
        isTampered,
        isSkewed,
      });
    }

    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `${c.red}Error sending webhook to ${targetUrl}:${c.reset} ${message}`
    );
    return 1;
  }
}
