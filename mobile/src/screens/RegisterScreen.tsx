import { useState } from 'react';
import {
  Alert,
  Image,
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
import type { Registration, RegistrationDraft } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

type RegisterState =
  | { kind: 'idle' }
  | { kind: 'success'; registration: Registration }
  | { kind: 'refused'; reason: string };

export function RegisterScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [faceB64, setFaceB64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterState>({ kind: 'idle' });

  const captureFace = () => {
    navigation.navigate('CaptureFace', {
      onCaptured: (b64) => {
        setFaceB64(b64);
        setResult({ kind: 'idle' });
      },
    });
  };

  const submit = async () => {
    if (!fullName.trim() || !nationalId.trim() || !phone.trim()) {
      Alert.alert('Missing info', 'Full name, national ID, and phone are required.');
      return;
    }
    if (!faceB64) {
      Alert.alert('Missing face capture', "Capture the attendee's face first.");
      return;
    }
    setSubmitting(true);
    setResult({ kind: 'idle' });
    try {
      const draft: RegistrationDraft = {
        full_name: fullName.trim(),
        national_id: nationalId.trim(),
        phone: phone.trim(),
        face_image_b64: faceB64,
      };
      const res = await api.createRegistration(eventId, draft);
      setResult({ kind: 'success', registration: res.registration });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setResult({ kind: 'refused', reason: e.message });
      } else {
        const msg = e instanceof ApiError ? e.message : 'Failed to register attendee';
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const registerAnother = () => {
    setFullName('');
    setNationalId('');
    setPhone('');
    setFaceB64(null);
    setResult({ kind: 'idle' });
  };

  const clearOutcomeAndKeep = () => {
    setResult({ kind: 'idle' });
  };

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.heading}>Register attendee</Text>
        <Text style={sharedStyles.subheading}>Event: {eventName}</Text>

        <View>
          <Text style={sharedStyles.label}>Full name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Given and family name"
            style={sharedStyles.input}
            autoCapitalize="words"
          />
        </View>

        <View>
          <Text style={sharedStyles.label}>National ID</Text>
          <TextInput
            value={nationalId}
            onChangeText={setNationalId}
            placeholder="National ID number"
            style={sharedStyles.input}
            autoCapitalize="characters"
          />
        </View>

        <View>
          <Text style={sharedStyles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+2547..."
            style={sharedStyles.input}
            keyboardType="phone-pad"
          />
        </View>

        <View>
          <Text style={sharedStyles.label}>Face capture</Text>
          {faceB64 ? (
            <View style={styles.preview}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${faceB64}` }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <PrimaryButton
                title="Recapture"
                variant="secondary"
                onPress={captureFace}
              />
            </View>
          ) : (
            <PrimaryButton title="Capture face" onPress={captureFace} />
          )}
        </View>

        <PrimaryButton title="Submit registration" onPress={submit} loading={submitting} />
      </View>

      {result.kind === 'success' ? (
        <View style={[sharedStyles.card, { borderColor: colors.success }]}>
          <Text style={[sharedStyles.heading, { color: colors.success }]}>
            Registered successfully
          </Text>
          <Text style={sharedStyles.subheading}>
            Attendee {result.registration.full_name} is now registered.
          </Text>
          <PrimaryButton title="Register another" onPress={registerAnother} />
        </View>
      ) : null}

      {result.kind === 'refused' ? (
        <View style={[sharedStyles.card, { borderColor: colors.danger }]}>
          <Text style={[sharedStyles.heading, { color: colors.danger }]}>
            Registration refused
          </Text>
          <Text style={sharedStyles.subheading}>{result.reason}</Text>
          <Text style={sharedStyles.subheading}>
            This person is already registered for this event and cannot be registered
            a second time.
          </Text>
          <PrimaryButton
            title="Edit details and retry"
            variant="secondary"
            onPress={clearOutcomeAndKeep}
          />
          <PrimaryButton title="Register a different person" onPress={registerAnother} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: {
    gap: spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
});
