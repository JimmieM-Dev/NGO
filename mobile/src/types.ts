export type Event = {
  id: string;
  name: string;
  location: string | null;
  operator: string | null;
  created_at: string;
};

export type Invitee = {
  id: string;
  event_id: string;
  display_name: string;
  phone_last4: string | null;
  claimed_by_attendee_id: string | null;
  created_at: string;
};

export type Checkin = {
  id: string;
  event_id: string;
  template_hash: string;
  checked_in_at: string;
  lat: number | null;
  lng: number | null;
};

export type CheckinResult = {
  checkin: Checkin;
  welcome_back: boolean;
  attendee_known: boolean;
};

export type Lookup = {
  template_hash: string;
  attendee_known: boolean;
  already_checked_in: boolean;
};

export type EventStats = {
  event_id: string;
  checked_in: number;
  invitees_total: number;
  invitees_claimed: number;
  walkins: number;
};

export type CheckinFlow = 'returning' | 'invitee' | 'walkin';

export type CheckinDraft = {
  template_hash: string;
  flow: CheckinFlow;
  lat?: number | null;
  lng?: number | null;
  invitee_id?: string;
  display_name?: string;
  phone_last4?: string;
};
