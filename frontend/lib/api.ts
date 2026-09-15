import { clearToken, getToken } from './auth';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Raised when the API could not be reached at all (server down, CORS, DNS). */
export class NetworkError extends Error {
  constructor(message = 'Cannot reach the TIMS API') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /**
   * Appended as a query string. Typed as `object` rather than
   * `Record<string, unknown>` so callers can pass their own filter interfaces
   * without adding an index signature to each one.
   */
  query?: object;
  /** Set false for endpoints that must work signed out. */
  auth?: boolean;
}

function buildUrl(path: string, query?: object): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (!query) return url.toString();

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export interface ApiResult<T> {
  data: T;
  meta: Record<string, unknown>;
}

export async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { body, query, auth = true, headers, ...rest } = options;

  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');

  if (auth) {
    const token = getToken();
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status === 204) return { data: undefined as T, meta: {} };

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // An expired or revoked token should drop the session rather than leave the
    // UI in a half-authenticated state.
    if (response.status === 401 && typeof window !== 'undefined') clearToken();

    throw new ApiError(
      response.status,
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      payload?.error?.code ?? 'ERROR',
      payload?.error?.details,
    );
  }

  return { data: (payload?.data ?? null) as T, meta: payload?.meta ?? {} };
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await requestWithMeta<T>(path, options);
  return data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  getWithMeta: <T>(path: string, options?: RequestOptions) =>
    requestWithMeta<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Turns any thrown value into a message worth showing a user.
 *
 * There is deliberately no client-side mock fallback. An earlier version of
 * this file swapped in a bundled sample dataset when the API was unreachable,
 * which meant a broken backend produced a dashboard full of invented
 * detections. Every figure in TIMS must come from a real API response, so an
 * unreachable API now surfaces as an error the user can act on.
 *
 * DEMO_MODE still exists, but it is a *server* setting: the backend decides
 * what to serve and flags it, and the UI renders a persistent "DEMO DATA"
 * banner. The client never invents records on its own.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) {
    return `Cannot reach the TIMS API at ${API_BASE_URL}. Check that the backend is running.`;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
