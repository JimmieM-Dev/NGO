export type Event = {
  id: string;
  name: string;
  location: string | null;
  operator: string | null;
  created_at: string;
};

export type Registration = {
  id: string;
  event_id: string;
  full_name: string;
  national_id: string;
  phone: string;
  face_sha256: string;
  face_dhash: string;
  is_duplicate: boolean;
  duplicate_reason: string | null;
  duplicate_of_id: string | null;
  created_at: string;
};

export type DuplicateInfo = {
  reason: string;
  matched_registration_id: string;
  matched_field: string;
};

export type RegistrationCreateResponse = {
  registration: Registration;
  duplicate: DuplicateInfo | null;
};

export type EventStats = {
  event_id: string;
  total: number;
  unique: number;
  duplicates: number;
};

export type RegistrationDraft = {
  full_name: string;
  national_id: string;
  phone: string;
  face_image_b64: string;
};
