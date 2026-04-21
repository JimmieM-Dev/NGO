import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RegistrationDraft } from './types';

const ACTIVE_EVENT_KEY = 'ngo.activeEventId';
const QUEUE_KEY = 'ngo.pendingRegistrations';

export async function getActiveEventId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_EVENT_KEY);
}

export async function setActiveEventId(id: string | null): Promise<void> {
  if (id === null) {
    await AsyncStorage.removeItem(ACTIVE_EVENT_KEY);
  } else {
    await AsyncStorage.setItem(ACTIVE_EVENT_KEY, id);
  }
}

export type QueuedRegistration = {
  event_id: string;
  draft: RegistrationDraft;
  queued_at: string;
};

export async function getQueue(): Promise<QueuedRegistration[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedRegistration[]) : [];
  } catch {
    return [];
  }
}

export async function enqueueRegistration(entry: QueuedRegistration): Promise<void> {
  const current = await getQueue();
  current.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(current));
}

export async function replaceQueue(entries: QueuedRegistration[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
}
