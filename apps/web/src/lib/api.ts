export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api${path}`;
  const headers = new Headers(options.headers || {});
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const err = data.error || { code: 'HTTP_ERROR', message: res.statusText };
      throw new ApiError(err.code, err.message, res.status);
    }
    return data as T;
  }

  if (!res.ok) {
    throw new ApiError('HTTP_ERROR', await res.text(), res.status);
  }

  return (await res.blob()) as unknown as T;
}

export const api = {
  get: <T = any>(path: string, options?: RequestInit) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T = any>(path: string, body?: any, options?: RequestInit) => 
    apiRequest<T>(path, { 
      ...options, 
      method: 'POST', 
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined) 
    }),
  put: <T = any>(path: string, body?: any, options?: RequestInit) => 
    apiRequest<T>(path, { 
      ...options, 
      method: 'PUT', 
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined) 
    }),
  delete: <T = any>(path: string, options?: RequestInit) => apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
