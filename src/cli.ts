import { parseArgs } from 'node:util';
import { sign } from './sign.js';
import { tamper as chaosTamper, replay as chaosReplay, skew as chaosSkew } from './chaos.js';
import { send } from './send.js';
import { providers } from './providers/index.js';
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

function printStatusOutput(params: {
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
}): void {
  const replayTag = params.isReplay ? ` ${c.magenta}[REPLAY]${c.reset}` : '';
  const tamperTag = params.isTampered ? ` ${c.yellow}[TAMPERED]${c.reset}` : '';
  const skewTag = params.isSkewed ? ` ${c.yellow}[SKEWED]${c.reset}` : '';

  console.log(
    `${c.gray}[${params.timestamp}]${c.reset} ${c.cyan}${c.bold}${params.provider.toUpperCase()}${c.reset} ${c.bold}${params.event}${c.reset}${replayTag}${tamperTag}${skewTag}`
  );
  console.log(`  ${c.dim}Target:${c.reset}       ${params.targetUrl}`);
  console.log(`  ${c.dim}Payload Size:${c.reset} ${params.payloadSize} bytes`);
  console.log(
    `  ${c.dim}HTTP Status:${c.reset}  ${formatStatus(params.statusCode, params.statusText)}`
  );
}

function printHelp(): void {
  console.log(`
${c.bold}hookforge${c.reset} - Provider-accurate webhook traffic on your laptop

${c.bold}USAGE:${c.reset}
  hookforge <provider> <event> --to <target_url> [options]

${c.bold}ARGUMENTS:${c.reset}
  <provider>            Provider name (${c.cyan}stripe${c.reset} | ${c.cyan}github${c.reset} | ${c.cyan}standard${c.reset})
  <event>               Event name (e.g. payment_intent.succeeded, push, user.created)

${c.bold}OPTIONS:${c.reset}
  --to <url>            Target URL to send webhook to (required)
  --secret <str>        Secret used to sign the webhook (default: provider default)
  --tamper              Mutate 1 byte in payload body to test signature rejection
  --replay              Send webhook then replay identical payload and headers
  --skew <seconds>      Recalculate signature with a stale timestamp (seconds ago)
  --data <json>         Custom JSON string payload
  -h, --help            Show this help message
  -v, --version         Show version
`);
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      to: { type: 'string' },
      secret: { type: 'string' },
      tamper: { type: 'boolean', default: false },
      replay: { type: 'boolean', default: false },
      skew: { type: 'string' },
      data: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.version) {
    console.log('0.1.0');
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
      `${c.red}Error:${c.reset} Invalid or missing provider "${rawProvider}". Supported providers: stripe, github, standard`
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

  let customPayload: unknown | undefined;
  if (typeof values.data === 'string') {
    try {
      customPayload = JSON.parse(values.data);
    } catch {
      customPayload = values.data;
    }
  }

  const secret = typeof values.secret === 'string' ? values.secret : undefined;

  // Generate signed payload
  let payload: SignedPayload = sign(provider, {
    event,
    secret,
    payload: customPayload,
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
    const res = await send(payload, targetUrl);
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
      const replayRes = await send(replayedPayload, targetUrl);
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

// If invoked as the main entry point
if (process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('cli.ts'))) {
  runCli().then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
