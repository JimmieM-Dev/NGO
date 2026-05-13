import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_EVENT_KEY = 'quorum.activeEventId';

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
