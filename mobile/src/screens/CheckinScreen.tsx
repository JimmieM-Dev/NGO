import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, ApiError } from '../api';
import { PrimaryButton } from '../components/PrimaryButton';
import { shortHash } from '../fingerprint';
import { colors, sharedStyles, spacing } from '../theme';
import type { CheckinFlow, CheckinResult, Invitee, Lookup } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkin'>;

type Stage =
  | { kind: 'awaiting-capture' }
  | { kind: 'looking-up'; templateHash: string }
  | { kind: 'choose-flow'; templateHash: string; lookup: Lookup }
  | { kind: 'pick-invitee'; templateHash: string; lookup: Lookup }
  | { kind: 'walkin-form'; templateHash: string; lookup: Lookup }
  | { kind: 'submitting' }
  | { kind: 'success'; result: CheckinResult }
  | { kind: 'refused'; reason: string };

function getBrowserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timeout = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timeout);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 },
    );
  });
}

export function CheckinScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;

  const [stage, setStage] = useState<Stage>({ kind: 'awaiting-capture' });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState('');
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhoneLast4, setWalkinPhoneLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;

  useEffect(() => {
    void getBrowserLocation().then(setLocation);
  }, []);

  const beginCapture = () => {
    setError(null);
    navigation.navigate('CaptureFingerprint', {
      onCaptured: (templateHash) => {
        void handleCaptured(templateHash);
      },
    });
  };

  const handleCaptured = async (templateHash: string) => {
    setStage({ kind: 'looking-up', templateHash });
    setError(null);
    try {
      const lookup = await api.lookup(eventId, templateHash);
      if (lookup.already_checked_in) {
        setStage({ kind: 'refused', reason: 'This fingerprint already checked in to this event.' });
        return;
      }
      if (lookup.attendee_known) {
        // Returning attendee — silent welcome back.
        setStage({ kind: 'submitting' });
        const result = await api.createCheckin(eventId, {
          template_hash: templateHash,
          flow: 'returning',
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
        });
        setStage({ kind: 'success', result });
        return;
      }
      // Unknown fingerprint — operator picks invitee or walk-in.
      setStage({ kind: 'choose-flow', templateHash, lookup });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStage({ kind: 'refused', reason: e.message });
        return;
      }
      const msg = e instanceof ApiError ? e.message : 'Failed to look up fingerprint';
      setError(msg);
      setStage({ kind: 'awaiting-capture' });
    }
  };

  const goPickInvitee = useCallback(async () => {
    const s = stageRef.current;
    if (s.kind !== 'choose-flow') return;
    setStage({ kind: 'pick-invitee', templateHash: s.templateHash, lookup: s.lookup });
    setInvLoading(true);
    try {
      const rows = await api.listInvitees(eventId);
      setInvitees(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invitees');
    } finally {
      setInvLoading(false);
    }
  }, [eventId]);

  const refreshInvitees = useCallback(async (q: string) => {
    setInvLoading(true);
    try {
      const rows = await api.listInvitees(eventId, q.trim() || undefined);
      setInvitees(rows);
    } finally {
      setInvLoading(false);
    }
  }, [eventId]);

  const submitInvitee = async (inv: Invitee) => {
    const s = stageRef.current;
    if (s.kind !== 'pick-invitee') return;
    setStage({ kind: 'submitting' });
    try {
      const result = await api.createCheckin(eventId, {
        template_hash: s.templateHash,
        flow: 'invitee',
        invitee_id: inv.id,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      });
      setStage({ kind: 'success', result });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStage({ kind: 'refused', reason: e.message });
        return;
      }
      setError(e instanceof Error ? e.message : 'Check-in failed');
      setStage({ kind: 'pick-invitee', templateHash: s.templateHash, lookup: s.lookup });
    }
  };

  const submitWalkin = async () => {
    const s = stageRef.current;
    if (s.kind !== 'walkin-form') return;
    if (!walkinName.trim()) {
      setError('Name is required for a walk-in.');
      return;
    }
    if (walkinPhoneLast4 && !/^\d{4}$/.test(walkinPhoneLast4.trim())) {
      setError('Phone last 4 must be exactly 4 digits.');
      return;
    }
    setStage({ kind: 'submitting' });
    setError(null);
    try {
      const result = await api.createCheckin(eventId, {
        template_hash: s.templateHash,
        flow: 'walkin',
        display_name: walkinName.trim(),
        phone_last4: walkinPhoneLast4.trim() || undefined,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      });
      setStage({ kind: 'success', result });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStage({ kind: 'refused', reason: e.message });
        return;
      }
      setError(e instanceof Error ? e.message : 'Check-in failed');
      setStage({ kind: 'walkin-form', templateHash: s.templateHash, lookup: s.lookup });
    }
  };

  const reset = () => {
    setQuery('');
    setInvitees([]);
    setWalkinName('');
    setWalkinPhoneLast4('');
    setError(null);
    setStage({ kind: 'awaiting-capture' });
  };

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.heading}>Check in attendee</Text>
        <Text style={sharedStyles.subheading}>Event: {eventName}</Text>
        <Text style={sharedStyles.subheading}>
          Location:{' '}
          {location
            ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
            : 'not captured (optional)'}
        </Text>
      </View>

      {stage.kind === 'awaiting-capture' ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.subheading}>
            Tap below to capture the attendee&apos;s fingerprint. The system will
            recognize returning attendees silently, or prompt for the invitee
            list / walk-in path if the fingerprint is new.
          </Text>
          <PrimaryButton title="Capture fingerprint" onPress={beginCapture} />
        </View>
      ) : null}

      {stage.kind === 'looking-up' || stage.kind === 'submitting' ? (
        <View style={[sharedStyles.card, styles.centerCard]}>
          <ActivityIndicator />
          <Text style={sharedStyles.subheading}>
            {stage.kind === 'looking-up' ? 'Looking up fingerprint…' : 'Recording check-in…'}
          </Text>
        </View>
      ) : null}

      {stage.kind === 'choose-flow' ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>Fingerprint not recognized</Text>
          <Text style={sharedStyles.subheading}>
            Hash: {shortHash(stage.templateHash)}…
          </Text>
          <Text style={sharedStyles.subheading}>Pick a path:</Text>
          <PrimaryButton title="On the invitee list" onPress={() => void goPickInvitee()} />
          <PrimaryButton
            title="New attendee / walk-in"
            variant="secondary"
            onPress={() =>
              setStage({
                kind: 'walkin-form',
                templateHash: stage.templateHash,
                lookup: stage.lookup,
              })
            }
          />
          <PrimaryButton title="Recapture" variant="secondary" onPress={beginCapture} />
        </View>
      ) : null}

      {stage.kind === 'pick-invitee' ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>Find on invitee list</Text>
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              void refreshInvitees(t);
            }}
            placeholder="Type a name or last-4 of phone…"
            style={sharedStyles.input}
            autoCapitalize="words"
          />
          {invLoading ? <ActivityIndicator /> : null}
          <FlatList
            data={invitees}
            scrollEnabled={false}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={
              !invLoading ? (
                <Text style={sharedStyles.subheading}>
                  No matches. Try a different spelling or use walk-in.
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.inviteeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteeName}>{item.display_name}</Text>
                  {item.phone_last4 ? (
                    <Text style={sharedStyles.subheading}>•••{item.phone_last4}</Text>
                  ) : null}
                  {item.claimed_by_attendee_id ? (
                    <Text style={[sharedStyles.subheading, { color: colors.muted }]}>
                      already bound to a fingerprint
                    </Text>
                  ) : null}
                </View>
                <PrimaryButton
                  title="Select"
                  variant={item.claimed_by_attendee_id ? 'secondary' : 'primary'}
                  onPress={() => void submitInvitee(item)}
                />
              </View>
            )}
          />
          <PrimaryButton title="Walk-in instead" variant="secondary" onPress={() => {
            const s = stageRef.current;
            if (s.kind !== 'pick-invitee') return;
            setStage({ kind: 'walkin-form', templateHash: s.templateHash, lookup: s.lookup });
          }} />
        </View>
      ) : null}

      {stage.kind === 'walkin-form' ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>New attendee (walk-in)</Text>
          <Text style={sharedStyles.subheading}>
            This is the only place a name is collected. Future events will
            recognize this fingerprint automatically.
          </Text>
          <View>
            <Text style={sharedStyles.label}>Full name</Text>
            <TextInput
              value={walkinName}
              onChangeText={setWalkinName}
              placeholder="Given and family name"
              style={sharedStyles.input}
              autoCapitalize="words"
            />
          </View>
          <View>
            <Text style={sharedStyles.label}>Phone last 4 (optional)</Text>
            <TextInput
              value={walkinPhoneLast4}
              onChangeText={setWalkinPhoneLast4}
              placeholder="e.g. 1234"
              style={sharedStyles.input}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <PrimaryButton title="Submit check-in" onPress={() => void submitWalkin()} />
        </View>
      ) : null}

      {stage.kind === 'success' ? (
        <View style={[sharedStyles.card, { borderColor: colors.success }]}>
          <Text style={[sharedStyles.heading, { color: colors.success }]}>
            {stage.result.welcome_back ? '✓ Welcome back' : '✓ Checked in'}
          </Text>
          <Text style={sharedStyles.subheading}>
            Hash: {shortHash(stage.result.checkin.template_hash)}…
          </Text>
          <Text style={sharedStyles.subheading}>
            Time: {new Date(stage.result.checkin.checked_in_at).toLocaleString()}
          </Text>
          <PrimaryButton title="Check in another" onPress={reset} />
        </View>
      ) : null}

      {stage.kind === 'refused' ? (
        <View style={[sharedStyles.card, { borderColor: colors.danger }]}>
          <Text style={[sharedStyles.heading, { color: colors.danger }]}>
            Check-in refused
          </Text>
          <Text style={sharedStyles.subheading}>{stage.reason}</Text>
          <PrimaryButton title="Try a different person" onPress={reset} />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerCard: { alignItems: 'center', gap: spacing.sm },
  inviteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inviteeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  error: { color: colors.danger, fontWeight: '600' },
});
