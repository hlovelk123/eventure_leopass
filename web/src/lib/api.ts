const envApi = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE = envApi ?? 'http://localhost:3000';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    },
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

type PostOptions = {
  headers?: Record<string, string>;
};

export function postJson<TResponse>(path: string, body: unknown, options: PostOptions = {}): Promise<TResponse> {
  return request<TResponse>(path, { method: 'POST', body, headers: options.headers });
}

export function getJson<TResponse>(path: string): Promise<TResponse> {
  return request<TResponse>(path, { method: 'GET' });
}

export function patchJson<TResponse>(path: string, body: unknown, options: PostOptions = {}): Promise<TResponse> {
  return request<TResponse>(path, { method: 'PATCH', body, headers: options.headers });
}

export function putJson<TResponse>(path: string, body: unknown, options: PostOptions = {}): Promise<TResponse> {
  return request<TResponse>(path, { method: 'PUT', body, headers: options.headers });
}

export function deleteJson<TResponse>(path: string, body?: unknown, options: PostOptions = {}): Promise<TResponse> {
  return request<TResponse>(path, {
    method: 'DELETE',
    body,
    headers: options.headers
  });
}
