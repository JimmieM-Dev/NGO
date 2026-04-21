import { getApiBaseUrl } from './config';
import type {
  Event,
  EventStats,
  Registration,
  RegistrationCreateResponse,
  RegistrationDraft,
} from './types';

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
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
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
