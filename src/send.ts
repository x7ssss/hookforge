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
  payload: SignedPayload,
  targetUrl: string | URL,
  options: SendOptions = {}
): Promise<Response> {
  const url = typeof targetUrl === 'string' ? targetUrl : targetUrl.toString();

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
