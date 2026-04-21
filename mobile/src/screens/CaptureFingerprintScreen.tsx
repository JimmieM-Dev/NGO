import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { colors, sharedStyles, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureFingerprint'>;

export function CaptureFingerprintScreen({ navigation, route }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  if (!permission) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={sharedStyles.subheading}>Requesting camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[sharedStyles.screen, styles.centered, { padding: spacing.lg }]}>
        <Text style={sharedStyles.heading}>Camera permission needed</Text>
        <Text style={sharedStyles.subheading}>
          We need camera access to capture attendee fingerprints.
        </Text>
        <PrimaryButton title="Grant permission" onPress={requestPermission} />
      </View>
    );
  }

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        skipProcessing: true,
      });
      if (photo?.base64) {
        setPreview(photo.base64);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!preview) return;
    route.params.onCaptured(preview);
    navigation.goBack();
  };

  return (
    <View style={[sharedStyles.screen, { padding: 0 }]}>
      {preview ? (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${preview}` }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <View style={styles.controls}>
            <PrimaryButton
              title="Retake"
              variant="secondary"
              onPress={() => setPreview(null)}
            />
            <PrimaryButton title="Use this capture" onPress={confirm} />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          <View pointerEvents="none" style={styles.guide}>
            <View style={styles.guideBox} />
            <Text style={styles.guideText}>
              Align the attendee&apos;s index finger inside the frame
            </Text>
          </View>
          <View style={styles.controls}>
            <PrimaryButton title="Capture" onPress={capture} loading={busy} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    gap: spacing.sm,
  },
  guide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideBox: {
    width: 220,
    height: 280,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
    opacity: 0.8,
  },
  guideText: {
    marginTop: spacing.md,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
