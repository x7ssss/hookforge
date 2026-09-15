# hookforge

[![CI](https://github.com/hookforge/hookforge/actions/workflows/ci.yml/badge.svg)](https://github.com/hookforge/hookforge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/hookforge.svg?style=flat-square)](https://www.npmjs.com/package/hookforge)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](https://www.npmjs.com/package/hookforge)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> **Provider-accurate webhook traffic on your laptop. Zero tunnels, zero accounts, 0 outbound network requests.**

---

## The Problem

Testing webhook handlers in local development is traditionally painful and fragile:

* **Tunnel Churn & Broken Workflows:** Setting up ngrok, Cloudflare Tunnels, or local tunnels requires third-party accounts, auth tokens, and yields dynamic URLs that expire or rotate whenever your process restarts.
* **The `express.json()` Re-Serialization Trap:** Webhook signature verification relies on byte-exact HMAC matching. If your middleware parses and re-stringifies JSON payloads before verification, subtle differences in whitespace, Unicode escapes, or object key sorting corrupt signatures.
* **Testing Chaos & Edge Cases is Impossible:** How do you simulate a replay attack? An expired timestamp? A payload altered in transit? Cloud providers will not send malformed or replayed signatures on demand to your development environment.

**hookforge** solves this by acting as a provider-accurate signing engine and chaos generator running directly inside your Node.js runtime or CLI.

---

## Quickstart (CLI)

No installation required. Fire authentic, cryptographically signed webhook payloads at your local server using `npx`:

```bash
# Send a valid Stripe payment_intent.succeeded event
npx hookforge stripe payment_intent.succeeded --to localhost:3000/api/webhooks

# Tamper 1 byte in the body to verify your signature rejection logic (returns 400/401)
npx hookforge standard user.created --to localhost:3000/api/webhooks --tamper

# Replay an event with identical timestamp and signature to test idempotency
npx hookforge github push --to localhost:3000/api/webhooks --replay
```

### CLI Options

```text
hookforge <provider> <event> --to <target_url> [options]

ARGUMENTS:
  <provider>            Provider name (stripe | github | standard)
  <event>               Event name (e.g. payment_intent.succeeded, push, user.created)

OPTIONS:
  --to <url>            Target URL to send webhook to (required)
  --secret <str>        Secret used to sign the webhook (default: provider default)
  --tamper              Mutate 1 byte in payload body to test signature rejection
  --replay              Send webhook then replay identical payload and headers
  --skew <seconds>      Recalculate signature with a stale timestamp (seconds ago)
  --data <json>         Custom JSON string payload
  -h, --help            Show help message
  -v, --version         Show version
```

---

## Programmatic API

Install `hookforge` as a development dependency:

```bash
npm install --save-dev hookforge
```

### 1. `sign(provider, options)`

A pure function that constructs provider-compliant headers and returns the payload strictly as a `Buffer` to guarantee byte integrity.

```typescript
import { sign } from 'hookforge';

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
import { sign, send } from 'hookforge';

const signed = sign('stripe');

// Both parameter orders supported:
const res = await send('http://localhost:3000/api/webhooks', signed);
console.log(res.status); // 200
```

### 3. Chaos Engineering: `tamper`, `replay`, and `skew`

Simulate production edge cases, replay attacks, and network tampering in your automated integration tests:

```typescript
import { sign, send, chaos } from 'hookforge';

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

Verify cryptographic HMAC signatures in your test suite using constant-time comparisons:

```typescript
import { sign, verify } from 'hookforge';

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
| **Standard Webhooks** | `webhook-signature` | HMAC-SHA256 base64 (`v1,${base64}`) over `${id}.${t}.${body}` | Svix, Clerk, Resend, Linear, Supabase |

---

## Architecture & Zero-Dependency Guarantee

* **Zero Runtime Dependencies:** `hookforge` contains **0** production dependencies. It relies exclusively on Node.js built-ins (`node:crypto`, `node:util`) and global web standards (`fetch`, `Headers`, `Response`).
* **Microsecond Startup:** No heavy CLI frameworks or bloated vendor SDKs to load before sending your event.
* **Strict Byte Integrity:** The payload is held strictly as an immutable `Buffer`. We never re-stringify, format, or normalize JSON across signing and dispatch.
* **Dual ESM + CommonJS:** Works seamlessly in modern ES modules (`import`) and legacy CommonJS (`require`).

---

## License

[MIT](LICENSE) © 2026 hookforge contributors
