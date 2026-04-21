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
import { colors, sharedStyles } from '../theme';
import type { Registration } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Duplicates'>;

export function DuplicatesScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.listDuplicates(eventId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load duplicates');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    navigation.setOptions({ title: `Duplicates · ${eventName}` });
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, eventName, load]);

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={sharedStyles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && rows.length === 0 ? <ActivityIndicator /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={sharedStyles.subheading}>
              No duplicates flagged for this event. Nice, clean data.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[sharedStyles.card, { borderColor: colors.danger }]}>
            <Text style={styles.name}>{item.full_name}</Text>
            <Text style={sharedStyles.subheading}>ID: {item.national_id}</Text>
            <Text style={sharedStyles.subheading}>Phone: {item.phone}</Text>
            <Text style={[sharedStyles.subheading, { color: colors.danger }]}>
              {item.duplicate_reason}
            </Text>
            <Text style={sharedStyles.subheading}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  error: {
    color: colors.danger,
  },
});
