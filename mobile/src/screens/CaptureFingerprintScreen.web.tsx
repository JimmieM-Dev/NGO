import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { colors, sharedStyles, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureFingerprint'>;

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function CaptureFingerprintScreen({ navigation, route }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('image/jpeg');
  const [error, setError] = useState<string | null>(null);

  const openPicker = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected on "Retake".
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('Failed to read image.');
    reader.onload = () => {
      const result = reader.result as string;
      setPreviewMime(file.type || 'image/jpeg');
      setPreviewB64(extractBase64(result));
    };
    reader.readAsDataURL(file);
  };

  const retake = () => {
    setPreviewB64(null);
    setError(null);
  };

  const confirm = () => {
    if (!previewB64) return;
    route.params.onCaptured(previewB64);
    navigation.goBack();
  };

  // On web, Platform.OS is always 'web'. Keep the guard defensively for HMR edge cases.
  if (Platform.OS !== 'web') return null;

  return (
    <View style={sharedStyles.screen}>
      <View style={sharedStyles.content}>
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>Capture fingerprint</Text>
          <Text style={sharedStyles.subheading}>
            On a phone or tablet this opens the rear camera so the operator can
            photograph the attendee&apos;s index finger. On desktop it opens a
            file picker so you can upload a test image and exercise the
            deduplication flow.
          </Text>

          {previewB64 ? (
            <>
              <Image
                source={{ uri: `data:${previewMime};base64,${previewB64}` }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <PrimaryButton title="Retake" variant="secondary" onPress={retake} />
              <PrimaryButton title="Use this capture" onPress={confirm} />
            </>
          ) : (
            <PrimaryButton title="Open camera / choose image" onPress={openPicker} />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>

      {/* Hidden DOM input — required because expo-camera's web preview is
          unreliable in deployed builds. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  previewImage: {
    width: '100%',
    height: 260,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
