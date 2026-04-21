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
import type { RegistrationCreateResponse, RegistrationDraft } from '../types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation, route }: Props) {
  const { eventId, eventName } = route.params;

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [fingerprintB64, setFingerprintB64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegistrationCreateResponse | null>(null);

  const captureFingerprint = () => {
    navigation.navigate('CaptureFingerprint', {
      onCaptured: (b64) => {
        setFingerprintB64(b64);
        setResult(null);
      },
    });
  };

  const submit = async () => {
    if (!fullName.trim() || !nationalId.trim() || !phone.trim()) {
      Alert.alert('Missing info', 'Full name, national ID, and phone are required.');
      return;
    }
    if (!fingerprintB64) {
      Alert.alert('Missing fingerprint', 'Capture the attendee\'s fingerprint first.');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const draft: RegistrationDraft = {
        full_name: fullName.trim(),
        national_id: nationalId.trim(),
        phone: phone.trim(),
        fingerprint_image_b64: fingerprintB64,
      };
      const res = await api.createRegistration(eventId, draft);
      setResult(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to register attendee';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const registerAnother = () => {
    setFullName('');
    setNationalId('');
    setPhone('');
    setFingerprintB64(null);
    setResult(null);
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
          <Text style={sharedStyles.label}>Fingerprint</Text>
          {fingerprintB64 ? (
            <View style={styles.preview}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${fingerprintB64}` }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <PrimaryButton
                title="Recapture"
                variant="secondary"
                onPress={captureFingerprint}
              />
            </View>
          ) : (
            <PrimaryButton title="Capture fingerprint" onPress={captureFingerprint} />
          )}
        </View>

        <PrimaryButton title="Submit registration" onPress={submit} loading={submitting} />
      </View>

      {result ? (
        <View
          style={[
            sharedStyles.card,
            { borderColor: result.duplicate ? colors.danger : colors.success },
          ]}
        >
          <Text
            style={[
              sharedStyles.heading,
              { color: result.duplicate ? colors.danger : colors.success },
            ]}
          >
            {result.duplicate ? 'Duplicate detected' : 'Registered successfully'}
          </Text>
          {result.duplicate ? (
            <Text style={sharedStyles.subheading}>{result.duplicate.reason}</Text>
          ) : (
            <Text style={sharedStyles.subheading}>
              Attendee {result.registration.full_name} is now registered.
            </Text>
          )}
          <PrimaryButton title="Register another" onPress={registerAnother} />
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
