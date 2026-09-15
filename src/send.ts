import type { SignedPayload } from './types.js';

export interface SendOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Native fetch wrapper that POSTs rawBody Buffer with Content-Length to the target URL.
 * Preserves exact bytes and sets provider signature headers.
 */
export async function send(
  first: SignedPayload | string | URL,
  second: SignedPayload | string | URL,
  options: SendOptions = {}
): Promise<Response> {
  let payload: SignedPayload;
  let rawUrl: string | URL;

  if (typeof first === 'string' || first instanceof URL) {
    rawUrl = first;
    payload = second as SignedPayload;
  } else {
    payload = first as SignedPayload;
    rawUrl = second as string | URL;
  }

  let url = typeof rawUrl === 'string' ? rawUrl : rawUrl.toString();
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  const headers: Record<string, string> = {
    ...payload.headers,
    'Content-Length': String(payload.rawBody.byteLength),
    ...(options.headers || {}),
  };

  let signal = options.signal;
  let timeoutId: NodeJS.Timeout | undefined;

  if (!signal && options.timeoutMs) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload.rawBody as any,
      signal,
    });
    return response;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
