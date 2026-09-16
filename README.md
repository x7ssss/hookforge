# hookforge

[![npm version](https://img.shields.io/npm/v/hookforge-cli.svg?style=flat-square)](https://www.npmjs.com/package/hookforge-cli)
[![CI](https://github.com/x7ssss/hookforge/actions/workflows/ci.yml/badge.svg)](https://github.com/x7ssss/hookforge/actions/workflows/ci.yml)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](https://www.npmjs.com/package/hookforge-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> **Provider-accurate webhook traffic on your laptop. Zero tunnels, zero accounts, 0 outbound network requests.**

---

## Terminal Demo

Test legitimate webhook handlers and signature rejection logic in milliseconds:

```text
# 1. Normal delivery -> 200 OK
$ npx hookforge-cli stripe payment_intent.succeeded --to http://localhost:3000/api/webhooks

[2026-09-16T09:00:00.124Z] STRIPE payment_intent.succeeded
  Target:       http://localhost:3000/api/webhooks
  Payload Size: 541 bytes
  HTTP Status:  200 OK

# 2. Tampered body (1 byte mutated, original signature kept) -> 400 Bad Request
$ npx hookforge-cli stripe payment_intent.succeeded --to http://localhost:3000/api/webhooks --tamper

[2026-09-16T09:00:01.402Z] STRIPE payment_intent.succeeded [TAMPERED]
  Target:       http://localhost:3000/api/webhooks
  Payload Size: 541 bytes
  HTTP Status:  400 Bad Request
```

---

## The Problem

Testing webhook handlers in local development is traditionally painful and fragile:

* **Tunnel Churn & Broken Workflows:** Setting up ngrok, Cloudflare Tunnels, or local tunnels requires third-party accounts, auth tokens, and yields dynamic URLs that expire or rotate whenever your process restarts.
* **The `express.json()` Re-Serialization Trap:** Webhook signature verification relies on byte-exact HMAC matching. If your middleware parses and re-stringifies JSON payloads before verification, subtle differences in whitespace, Unicode escapes, or object key sorting corrupt signatures.
* **Testing Chaos & Edge Cases is Impossible:** How do you simulate a replay attack? An expired timestamp? A payload altered in transit? Cloud providers will not send malformed or replayed signatures on demand to your development environment.

**hookforge** solves this by acting as a provider-accurate signing engine and chaos generator running directly inside your Node.js runtime or CLI.

---

## Why hookforge vs Vendor CLIs vs ngrok

| Feature | hookforge | Vendor CLIs (`stripe-cli`, `gh`) | ngrok / Tunnels |
| :--- | :--- | :--- | :--- |
| **Network Requirement** | **100% Offline** (localhost only) | Requires active internet connection | Requires active internet connection |
| **Third-Party Accounts** | **Zero accounts**, zero API keys | Requires dashboard login & token | Requires ngrok account & auth token |
| **Multi-Provider** | **Unified** (Stripe, GitHub, Shopify, Slack, Paddle, Resend, Twilio, Svix) | Fragmented (separate CLI per vendor) | Agnostic tunnel (does not generate webhooks) |
| **Signature Verification Testing** | **Native** (recreates exact HMAC signatures) | Generates valid signatures only | Passes cloud signatures through tunnel |
| **Chaos & Attack Simulation** | **Built-in** (`--tamper`, `--replay`, `--skew`) | **None** (cannot send malformed traffic) | **None** (cannot simulate attacks) |
| **CI / Automated Test Suitability** | **Instant** (`npm install`, runs in headless CI) | Complex (requires mock services / secrets) | Poor (requires tunnels and public listeners) |
| **Runtime Dependencies** | **0 dependencies** (Node built-ins only) | Standalone binary or heavy packages | Heavy binary daemon |
| **Startup Overhead** | **<50ms** | Variable (cloud authentication handshake) | Variable (tunnel negotiation handshake) |

---

## Installation & Quickstart

### 1. Interactive Zero-Arg Wizard

Simply run `hookforge` with no arguments in any interactive terminal to launch the zero-configuration interactive wizard powered by Node.js built-in `readline`:

```bash
hookforge
# or via npx
npx hookforge-cli
```

```text
hookforge - Interactive Webhook Wizard

Select Provider:
  1) stripe
  2) github
  3) shopify
  4) svix
  5) slack
  6) paddle
  7) resend
  8) twilio

Enter provider [1-8 or name] (default: stripe): 6

Select Event for paddle:
  1) subscription.created
  2) transaction.completed

Enter event [1-2 or custom] (default: subscription.created): 1

Target URL (default: http://localhost:3000/api/webhooks): 
Secret key (optional, default: pdl_ntfset_test): 
Tamper test? (y/N): n

[2026-09-16T10:00:00.000Z] PADDLE subscription.created
  Target:       http://localhost:3000/api/webhooks
  Payload Size: 620 bytes
  HTTP Status:  200 OK
```

---

### 2. Direct CLI Runner (No Installation Required)

Fire authentic, cryptographically signed webhook payloads at your local server using `npx`:

```bash
# Send a valid Stripe payment_intent.succeeded event
npx hookforge-cli stripe payment_intent.succeeded --to http://localhost:3000/api/webhooks

# Send a Paddle subscription.created webhook
npx hookforge-cli paddle subscription.created --to http://localhost:3000/api/webhooks

# Send a Resend email.delivered webhook (Svix standard)
npx hookforge-cli resend email.delivered --to http://localhost:3000/api/webhooks

# Send a Twilio message.received webhook
npx hookforge-cli twilio message.received --to http://localhost:3000/api/webhooks

# Send a Shopify orders/create webhook
npx hookforge-cli shopify orders/create --to http://localhost:3000/api/webhooks

# Send a Slack app_mention webhook
npx hookforge-cli slack app_mention --to http://localhost:3000/api/webhooks

# Tamper 1 byte in the body to verify your signature rejection logic (returns 400/401)
npx hookforge-cli standard user.created --to http://localhost:3000/api/webhooks --tamper

# Replay an event with identical timestamp and signature to test idempotency
npx hookforge-cli github push --to http://localhost:3000/api/webhooks --replay
```

### 3. Global Installation

Install globally to use the convenient `hookforge` alias directly anywhere in your terminal:

```bash
npm install -g hookforge-cli
```

> **Binary Invocation:** Both `npx hookforge-cli` and the global alias command `hookforge` (as well as `hookforge-cli`) invoke the underlying binary identically.

```bash
# Using the hookforge alias
hookforge stripe payment_intent.succeeded --to http://localhost:3000/api/webhooks

# Using the full hookforge-cli command
hookforge-cli shopify orders/create --to http://localhost:3000/api/webhooks
```

---

### 4. Custom Payloads & Custom Headers

`hookforge` guarantees strict byte-for-byte cryptographic integrity: signatures are always calculated against the exact resolved payload bytes (custom or template) without JSON formatting, key sorting alterations, or whitespace normalization.

#### Inline Raw JSON (`--data` / `-d`)
Pass an inline raw JSON string directly on the command line:

```bash
hookforge stripe customer.subscription.deleted \
  --to http://localhost:3000/api/webhooks \
  -d '{"id": "sub_custom_123", "status": "canceled"}'
```

#### Custom Payload Files (`--file` / `-f`)
Load payload bytes from a relative or absolute JSON file:

```bash
# Relative file path
hookforge paddle subscription.created \
  --to http://localhost:3000/api/webhooks \
  -f ./payloads/paddle-event.json

# Absolute file path
hookforge github push \
  --to http://localhost:3000/api/webhooks \
  --file /var/data/custom-push.json
```

#### Multiple Custom HTTP Headers (`--header` / `-H`)
Provide one or more custom HTTP headers (e.g. for authentication, routing, or environment flags):

```bash
hookforge twilio message.received \
  --to http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer test_api_token" \
  -H "X-Source: local-integration-test" \
  -H "X-Environment: development"
```

#### Piping via Stdin
Pipe custom JSON payloads directly from files or other CLI utilities:

```bash
# Pipe custom payload from file (auto-detected when piped)
cat custom-order.json | hookforge shopify orders/create --to http://localhost:3000/api/webhooks

# Pipe custom payload using explicit stdin flag
echo '{"action": "custom_event"}' | hookforge github push --to http://localhost:3000/api/webhooks --data -
```

---

### CLI Options

Both `hookforge` and `hookforge-cli` accept identical syntax and options:

```text
hookforge <provider> <event> --to <target_url> [options]
# or
npx hookforge-cli <provider> <event> --to <target_url> [options]
# or interactive zero-arg wizard:
hookforge

ARGUMENTS:
  <provider>            Provider name (stripe | github | shopify | svix | standard | slack | paddle | resend | twilio)
  <event>               Event name (e.g. payment_intent.succeeded, push, orders/create, subscription.created, email.sent, message.received)

OPTIONS:
  --to <url>            Target URL to send webhook to (required in non-interactive mode)
  --secret <str>        Secret used to sign the webhook (default: provider default)
  --tamper              Mutate 1 byte in payload body to test signature rejection
  --replay              Send webhook then replay identical payload and headers
  --skew <seconds>      Recalculate signature with a stale timestamp (seconds ago)
  -d, --data <json>     Custom JSON string payload (or '-' to read from stdin)
  -f, --file <path>     Path to custom JSON payload file (relative or absolute)
  -H, --header <str>    Custom HTTP header (can be repeated, e.g. -H "X-Custom: 123")
  -h, --help            Show help message
  -v, --version         Show version
```

---

## Programmatic API

Install `hookforge-cli` as a development dependency:

```bash
npm install --save-dev hookforge-cli
```

### 1. `sign(provider, options)`

A pure function that constructs provider-compliant headers and returns the payload strictly as a `Buffer` to guarantee byte integrity.

```typescript
import { sign } from 'hookforge-cli';

// Sign with realistic default fixtures
const payload = sign('stripe', {
  event: 'payment_intent.succeeded',
  secret: 'whsec_custom_secret',
});

console.log(payload.headers['stripe-signature']);
// => "t=1718000000,v1=9b1d..."
console.log(payload.rawBody);
// => <Buffer 7b 22 69 64 22 3a 20 ...>
```

### 2. `send(url, signedPayload)`

A lightweight wrapper around native `fetch` that POSTs the raw `Buffer` with an explicit `Content-Length` header without modifying bytes or encodings:

```typescript
import { sign, send } from 'hookforge-cli';

const signed = sign('shopify');

// Both parameter orders supported:
const res = await send('http://localhost:3000/api/webhooks', signed);
console.log(res.status); // 200
```

### 3. Chaos Engineering: `tamper`, `replay`, and `skew`

Simulate production edge cases, replay attacks, and network tampering in your automated integration tests:

```typescript
import { sign, send, chaos } from 'hookforge-cli';

const original = sign('standard', { event: 'user.created' });

// 1. Tamper: Mutates 1 byte in rawBody without changing signature headers
const tampered = chaos.tamper(original);
const resTampered = await send('http://localhost:3000/api/webhooks', tampered);
// Expect your receiver to return 400 Bad Request!

// 2. Replay: Preserves identical timestamp and signature headers
const replayed = chaos.replay(original);
const resReplayed = await send('http://localhost:3000/api/webhooks', replayed);
// Test your database deduplication / idempotency key handling!

// 3. Skew: Recalculates signature with an expired timestamp (e.g. 10 minutes ago)
const expired = chaos.skew(original, 600);
const resExpired = await send('http://localhost:3000/api/webhooks', expired);
// Verify your timestamp tolerance guardrails!
```

### 4. `verify(payload, options?)`

Verify cryptographic HMAC signatures in your test suite using constant-time comparisons across all supported providers:

```typescript
import { sign, verify } from 'hookforge-cli';

const signed = sign('github', { event: 'push' });
const isValid = verify(signed); // true

const tampered = chaos.tamper(signed);
const isTamperedValid = verify(tampered); // false
```

---

## Supported Providers

| Provider | Signature Header | Signing Algorithm | Ecosystem Compatibility |
| :--- | :--- | :--- | :--- |
| **Stripe** | `stripe-signature` | HMAC-SHA256 hex (`t=${t},v1=${hex}`) over `${t}.${body}` | Stripe Payments, Billing, Connect |
| **GitHub** | `x-hub-signature-256` | HMAC-SHA256 hex (`sha256=${hex}`) over raw body bytes | GitHub Apps, Webhooks, Actions |
| **Standard / Svix** | `webhook-signature` | HMAC-SHA256 base64 (`v1,${base64}`) over `${id}.${t}.${body}` | Svix, Clerk, Linear, Supabase |
| **Shopify** | `X-Shopify-Hmac-Sha256` | HMAC-SHA256 base64 digest over raw payload body | Shopify Apps, Checkout, Orders |
| **Slack** | `X-Slack-Signature` | HMAC-SHA256 hex (`v0=${hex}`) over `v0:${timestamp}:${body}` | Slack Apps, Bolt, Events API |
| **Paddle** | `Paddle-Signature` | HMAC-SHA256 hex (`ts=${ts};h1=${hex}`) over `${ts}:${body}` | Paddle Billing, Subscriptions, Checkout |
| **Resend** | `svix-signature` | HMAC-SHA256 base64 (`v1,${base64}`) over `${id}.${timestamp}.${body}` | Resend Transactional Email (Svix Standard) |
| **Twilio** | `X-Twilio-Signature` | HMAC-SHA1 base64 digest over `${targetUrl}${sortedFormOrBodyParams}` | Twilio SMS, Voice, Messaging Webhooks |

---

## Architecture & Zero-Dependency Guarantee

* **Zero Runtime Dependencies:** `hookforge-cli` contains **0** production dependencies. It relies exclusively on Node.js built-ins (`node:crypto`, `node:util`) and global web standards (`fetch`, `Headers`, `Response`).
* **Microsecond Startup:** No heavy CLI frameworks or bloated vendor SDKs to load before sending your event.
* **Strict Byte Integrity:** The payload is held strictly as an immutable `Buffer`. We never re-stringify, format, or normalize JSON across signing and dispatch.
* **Dual ESM + CommonJS:** Works seamlessly in modern ES modules (`import`) and legacy CommonJS (`require`).

---

## License

[MIT](LICENSE) © 2026 hookforge contributors
