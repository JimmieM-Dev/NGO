import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api';
import { PrimaryButton } from '../components/PrimaryButton';
import { shortHash } from '../fingerprint';
import { colors, sharedStyles, spacing } from '../theme';
import type { Checkin, EventStats } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDashboard'>;

export function EventDashboardScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;
  const [stats, setStats] = useState<EventStats | null>(null);
  const [recent, setRecent] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, ck] = await Promise.all([
        api.getStats(eventId),
        api.listCheckins(eventId),
      ]);
      setStats(s);
      setRecent(ck.slice(0, 50));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load event data');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    navigation.setOptions({ title: eventName });
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, eventName, load]);

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        data={recent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={sharedStyles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View style={[sharedStyles.card, styles.statsRow]}>
              <Stat label="Checked in" value={stats?.checked_in ?? '–'} />
              <Stat
                label="From list"
                value={stats?.invitees_claimed ?? '–'}
                color={colors.success}
              />
              <Stat label="Walk-ins" value={stats?.walkins ?? '–'} color={colors.accent} />
            </View>

            <View style={{ gap: spacing.sm }}>
              <PrimaryButton
                title="Check in attendee"
                onPress={() => navigation.navigate('Checkin', { eventId, eventName })}
              />
              <PrimaryButton
                title="Manage invitee list"
                variant="secondary"
                onPress={() => navigation.navigate('Invitees', { eventId, eventName })}
              />
            </View>

            <Text style={sharedStyles.heading}>Anonymous roster</Text>
            <Text style={sharedStyles.subheading}>
              Per-event log is identity-free. Names live in the admin-only
              attendee directory (not shown on this screen).
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && recent.length === 0 ? <ActivityIndicator /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={sharedStyles.subheading}>
              No check-ins yet. Tap &quot;Check in attendee&quot; to start.
            </Text>
          ) : null
        }
        renderItem={({ item }) => <CheckinRow row={item} />}
      />
    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={sharedStyles.subheading}>{label}</Text>
    </View>
  );
}

function CheckinRow({ row }: { row: Checkin }) {
  return (
    <View style={[sharedStyles.card, styles.row]}>
      <View style={styles.hashChip}>
        <Text style={styles.hashChipText}>{shortHash(row.template_hash)}…</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.timeText}>
          {new Date(row.checked_in_at).toLocaleString()}
        </Text>
        {row.lat != null && row.lng != null ? (
          <Text style={sharedStyles.subheading}>
            {row.lat.toFixed(4)}, {row.lng.toFixed(4)}
          </Text>
        ) : (
          <Text style={sharedStyles.subheading}>no location</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  hashChip: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  hashChipText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#1e3a8a',
    fontWeight: '700',
  },
  timeText: { fontSize: 14, fontWeight: '600', color: colors.text },
  error: { color: colors.danger },
});
