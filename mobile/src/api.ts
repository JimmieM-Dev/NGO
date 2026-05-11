import { getApiBaseUrl } from './config';
import type {
  Checkin,
  CheckinDraft,
  CheckinResult,
  Event,
  EventStats,
  Invitee,
  Lookup,
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
  // Events
  listEvents: () => request<Event[]>('/events'),
  createEvent: (body: { name: string; location?: string; operator?: string }) =>
    request<Event>('/events', { method: 'POST', body: JSON.stringify(body) }),
  getStats: (eventId: string) => request<EventStats>(`/events/${eventId}/stats`),

  // Invitees
  listInvitees: (eventId: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<Invitee[]>(`/events/${eventId}/invitees${qs}`);
  },
  addInvitees: (
    eventId: string,
    invitees: Array<{ display_name: string; phone_last4?: string | null }>,
  ) =>
    request<Invitee[]>(`/events/${eventId}/invitees`, {
      method: 'POST',
      body: JSON.stringify({ invitees }),
    }),
  uploadInviteesCsv: async (eventId: string, file: Blob, filename = 'invitees.csv') => {
    const form = new FormData();
    form.append('file', file, filename);
    const url = `${getApiBaseUrl().replace(/\/+$/, '')}/events/${eventId}/invitees/bulk-csv`;
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text();
      }
      throw new ApiError(res.status, extractMessage(detail), detail);
    }
    return (await res.json()) as Invitee[];
  },

  // Check-ins
  lookup: (eventId: string, templateHash: string) =>
    request<Lookup>(
      `/events/${eventId}/lookup?template_hash=${encodeURIComponent(templateHash)}`,
    ),
  createCheckin: (eventId: string, draft: CheckinDraft) =>
    request<CheckinResult>(`/events/${eventId}/checkins`, {
      method: 'POST',
      body: JSON.stringify(draft),
    }),
  listCheckins: (eventId: string) => request<Checkin[]>(`/events/${eventId}/checkins`),
};
