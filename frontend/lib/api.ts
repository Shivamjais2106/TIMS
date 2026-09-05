import { clearToken, getToken } from './auth';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

/**
 * Demo mode.
 *
 * When the backend or database is not running, setting
 * NEXT_PUBLIC_DEMO_MODE=true makes the dashboard fall back to a bundled sample
 * dataset and bypass the route guard, so the UI can still be presented.
 * It is off by default and must never be enabled in a real deployment.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

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
   * without adding an index signature to every one of them.
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

/** Result of a request, including the `meta` envelope for paginated endpoints. */
export interface ApiResult<T> {
  data: T;
  meta: Record<string, unknown>;
}

export async function requestWithMeta<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
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
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Runs `call`, falling back to bundled sample data when the API is unreachable
 * *and* demo mode is on.
 *
 * Only NetworkError triggers the fallback — a 4xx/5xx from a live API is a real
 * error and is rethrown, so a broken backend never hides behind fake numbers.
 */
export async function withDemoFallback<T>(call: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (DEMO_MODE && error instanceof NetworkError) return fallback();
    throw error;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) {
    return 'Cannot reach the TIMS API. Make sure the backend is running on ' + API_BASE_URL;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
