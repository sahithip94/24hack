import type { PatientRecord, PatientUser } from '../types';

/**
 * API client for the FastAPI "Lost in Transit" backend.
 *
 * Authentication is via signed bearer tokens (patient or guest),
 * stored client-side and attached to every request. The backend
 * enforces all authorization server-side; the frontend never
 * decides access on its own.
 */
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001';

export const TOKEN_KEY = 'medivault_access_token';
export const GUEST_TOKEN_PREFIX = 'medivault_guest_token_';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getGuestToken(shareToken: string): string | null {
  return sessionStorage.getItem(GUEST_TOKEN_PREFIX + shareToken);
}

export function setGuestToken(shareToken: string, guestToken: string | null): void {
  const key = GUEST_TOKEN_PREFIX + shareToken;
  if (guestToken) {
    sessionStorage.setItem(key, guestToken);
  } else {
    sessionStorage.removeItem(key);
  }
}

export class ApiRequestError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.detail = message;
  }
}

function describeError(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // Pydantic 422 validation errors: [{loc, msg, type}, ...]
    if (Array.isArray(detail)) {
      return detail
        .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg?: unknown }).msg) : ''))
        .filter(Boolean)
        .join('; ');
    }
  }
  return `Request failed (${status})`;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  // Attach the patient token only when the caller has not
  // supplied its own Authorization header (guest requests
  // pass a guest access token explicitly).
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const isFormData = init?.body instanceof FormData;
  if (!isFormData && init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(API_BASE + path, {
    ...init,
    headers,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON error body.
    }
    throw new ApiRequestError(describeError(body, res.status), res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Upload a document with real progress events via XHR (bearer auth). */
export function uploadDocumentWithProgress(
  path: string,
  form: FormData,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + path, true);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    if (signal) {
      if (signal.aborted) {
        reject(new ApiRequestError('Upload cancelled.', 0));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort());
    }
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new ApiRequestError('Network error during upload.', 0));
    xhr.onabort = () => reject(new ApiRequestError('Upload cancelled.', 0));
    xhr.send(form);
  });
}

/**
 * Fetch an original document file as an authenticated blob and return a
 * temporary object URL. Bearer tokens cannot be attached to plain
 * <a>/<img> requests, so file access goes through this helper.
 * Caller must revoke the returned URL with URL.revokeObjectURL.
 */
export async function fetchFileAsObjectUrl(
  path: string,
  bearerToken: string,
): Promise<string> {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // keep generic message
    }
    throw new ApiRequestError(detail, res.status);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type { PatientRecord, PatientUser };
