import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, ApiError } from '../api';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, sharedStyles, spacing } from '../theme';
import type { Invitee } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Invitees'>;

export function InviteesScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;

  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvitees(await api.listInvitees(eventId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invitees');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    navigation.setOptions({ title: `Invitees — ${eventName}` });
    void load();
  }, [navigation, eventName, load]);

  const addOne = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (phoneLast4 && !/^\d{4}$/.test(phoneLast4.trim())) {
      setError('Phone last 4 must be 4 digits.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api.addInvitees(eventId, [
        { display_name: name.trim(), phone_last4: phoneLast4.trim() || null },
      ]);
      setName('');
      setPhoneLast4('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to add invitee');
    } finally {
      setAdding(false);
    }
  };

  const uploadCsv = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setError('CSV upload is only available on the web app for now.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      setError(null);
      try {
        await api.uploadInviteesCsv(eventId, file, file.name);
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        data={invitees}
        keyExtractor={(i) => i.id}
        contentContainerStyle={sharedStyles.content}
        ListHeaderComponent={
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={sharedStyles.card}>
              <Text style={sharedStyles.heading}>Add invitee</Text>
              <Text style={sharedStyles.subheading}>
                The invitee list is the per-event guest list. No fingerprints
                stored here — those are collected at check-in.
              </Text>
              <View>
                <Text style={sharedStyles.label}>Display name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  style={sharedStyles.input}
                  autoCapitalize="words"
                />
              </View>
              <View>
                <Text style={sharedStyles.label}>Phone last 4 (optional)</Text>
                <TextInput
                  value={phoneLast4}
                  onChangeText={setPhoneLast4}
                  placeholder="e.g. 1234"
                  style={sharedStyles.input}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <PrimaryButton title="Add invitee" onPress={addOne} loading={adding} />
              <PrimaryButton
                title={uploading ? 'Uploading…' : 'Upload CSV (display_name,phone_last4)'}
                variant="secondary"
                onPress={uploadCsv}
                loading={uploading}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <Text style={[sharedStyles.heading, { marginTop: spacing.md }]}>
              Invitees ({invitees.length})
            </Text>
            {loading && invitees.length === 0 ? <ActivityIndicator /> : null}
          </ScrollView>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={sharedStyles.subheading}>
              No invitees yet. Add some above or upload a CSV.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[sharedStyles.card, styles.row]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.display_name}</Text>
              {item.phone_last4 ? (
                <Text style={sharedStyles.subheading}>•••{item.phone_last4}</Text>
              ) : null}
              <Text
                style={[
                  sharedStyles.subheading,
                  { color: item.claimed_by_attendee_id ? colors.success : colors.muted },
                ]}
              >
                {item.claimed_by_attendee_id ? 'checked in' : 'not yet checked in'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  error: { color: colors.danger, fontWeight: '600' },
});
