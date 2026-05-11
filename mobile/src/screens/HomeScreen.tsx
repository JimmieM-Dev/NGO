import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, ApiError } from '../api';
import { getApiBaseUrl } from '../config';
import { PrimaryButton } from '../components/PrimaryButton';
import { setActiveEventId } from '../storage';
import { colors, sharedStyles, spacing } from '../theme';
import type { Event } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [operator, setOperator] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await api.listEvents());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const createEvent = async () => {
    if (!name.trim()) {
      Alert.alert('Event name required');
      return;
    }
    setCreating(true);
    try {
      const created = await api.createEvent({
        name: name.trim(),
        location: location.trim() || undefined,
        operator: operator.trim() || undefined,
      });
      setName('');
      setLocation('');
      setOperator('');
      setEvents((prev) => [created, ...prev]);
      await openEvent(created);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create event';
      Alert.alert('Error', msg);
    } finally {
      setCreating(false);
    }
  };

  const openEvent = async (event: Event) => {
    await setActiveEventId(event.id);
    navigation.navigate('EventDashboard', { eventId: event.id, eventName: event.name });
  };

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        contentContainerStyle={sharedStyles.content}
        data={events}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.heading}>Start a new event</Text>
              <Text style={sharedStyles.subheading}>
                Verified attendance. Anonymous by design. Create an event, then check
                attendees in with a biometric scan — no names on the operator&apos;s
                screen unless someone is new.
              </Text>
              <View>
                <Text style={sharedStyles.label}>Event name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Kibera Health Sensitization"
                  style={sharedStyles.input}
                />
              </View>
              <View>
                <Text style={sharedStyles.label}>Location (optional)</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="e.g. Nairobi"
                  style={sharedStyles.input}
                />
              </View>
              <View>
                <Text style={sharedStyles.label}>Operator (optional)</Text>
                <TextInput
                  value={operator}
                  onChangeText={setOperator}
                  placeholder="Field staff name"
                  style={sharedStyles.input}
                />
              </View>
              <PrimaryButton title="Create event" onPress={createEvent} loading={creating} />
            </View>

            <Text style={[sharedStyles.heading, { marginTop: spacing.md }]}>Recent events</Text>
            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.error}>{error}</Text>
                <Text style={styles.errorHint}>Backend: {getApiBaseUrl()}</Text>
                <PrimaryButton title="Retry" variant="secondary" onPress={load} />
              </View>
            ) : null}
            {loading && events.length === 0 ? <ActivityIndicator /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={sharedStyles.subheading}>
              No events yet. Create one above to start registering attendees.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[sharedStyles.card, styles.eventRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventName}>{item.name}</Text>
              <Text style={sharedStyles.subheading}>
                {[item.location, item.operator].filter(Boolean).join(' · ') || 'No location'}
              </Text>
              <Text style={sharedStyles.subheading}>
                Created {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            <PrimaryButton title="Open" onPress={() => openEvent(item)} variant="secondary" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  error: {
    color: colors.danger,
    fontWeight: '600',
  },
  errorCard: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: '#fef2f2',
  },
  errorHint: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
});
