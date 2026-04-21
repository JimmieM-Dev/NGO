import { getApiBaseUrl } from './config';
import type {
  Event,
  EventStats,
  Registration,
  RegistrationCreateResponse,
  RegistrationDraft,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const obj = detail as Record<string, unknown>;
    // FastAPI wraps custom HTTPException details in { detail: ... }.
    const inner = 'detail' in obj ? obj.detail : obj;
    if (typeof inner === 'string') return inner;
    if (inner && typeof inner === 'object' && 'reason' in (inner as Record<string, unknown>)) {
      const reason = (inner as Record<string, unknown>).reason;
      if (typeof reason === 'string') return reason;
    }
  }
  return JSON.stringify(detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl().replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, extractMessage(detail), detail);
  }
  return (await res.json()) as T;
}

export const api = {
  listEvents: () => request<Event[]>('/events'),
  createEvent: (body: { name: string; location?: string; operator?: string }) =>
    request<Event>('/events', { method: 'POST', body: JSON.stringify(body) }),
  getStats: (eventId: string) => request<EventStats>(`/events/${eventId}/stats`),
  listRegistrations: (eventId: string) =>
    request<Registration[]>(`/events/${eventId}/registrations`),
  listDuplicates: (eventId: string) =>
    request<Registration[]>(`/events/${eventId}/duplicates`),
  createRegistration: (eventId: string, draft: RegistrationDraft) =>
    request<RegistrationCreateResponse>(`/events/${eventId}/registrations`, {
      method: 'POST',
      body: JSON.stringify(draft),
    }),
};
