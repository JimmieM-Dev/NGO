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
import { colors, sharedStyles, spacing } from '../theme';
import type { EventStats, Registration } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDashboard'>;

export function EventDashboardScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;
  const [stats, setStats] = useState<EventStats | null>(null);
  const [recent, setRecent] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, regs] = await Promise.all([
        api.getStats(eventId),
        api.listRegistrations(eventId),
      ]);
      setStats(s);
      setRecent(regs.slice(0, 20));
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
              <Stat label="Total" value={stats?.total ?? '–'} />
              <Stat label="Unique" value={stats?.unique ?? '–'} color={colors.success} />
              <Stat label="Duplicates" value={stats?.duplicates ?? '–'} color={colors.danger} />
            </View>

            <View style={{ gap: spacing.sm }}>
              <PrimaryButton
                title="Register new attendee"
                onPress={() => navigation.navigate('Register', { eventId, eventName })}
              />
              <PrimaryButton
                title="View flagged duplicates"
                variant="secondary"
                onPress={() => navigation.navigate('Duplicates', { eventId, eventName })}
              />
            </View>

            <Text style={sharedStyles.heading}>Recent registrations</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && recent.length === 0 ? <ActivityIndicator /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={sharedStyles.subheading}>
              No attendees registered yet. Tap "Register new attendee" to start.
            </Text>
          ) : null
        }
        renderItem={({ item }) => <RegistrationRow reg={item} />}
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

function RegistrationRow({ reg }: { reg: Registration }) {
  return (
    <View
      style={[
        sharedStyles.card,
        reg.is_duplicate ? { borderColor: colors.danger } : null,
      ]}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.name}>{reg.full_name}</Text>
        {reg.is_duplicate ? <Text style={styles.dupTag}>DUPLICATE</Text> : null}
      </View>
      <Text style={sharedStyles.subheading}>ID: {reg.national_id}</Text>
      <Text style={sharedStyles.subheading}>Phone: {reg.phone}</Text>
      {reg.duplicate_reason ? (
        <Text style={[sharedStyles.subheading, { color: colors.danger }]}>
          {reg.duplicate_reason}
        </Text>
      ) : null}
      <Text style={sharedStyles.subheading}>
        {new Date(reg.created_at).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dupTag: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  error: {
    color: colors.danger,
  },
});
