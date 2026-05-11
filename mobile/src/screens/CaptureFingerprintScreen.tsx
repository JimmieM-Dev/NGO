import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { templateHashFromBase64, shortHash } from '../fingerprint';
import { colors, sharedStyles, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureFingerprint'>;

export function CaptureFingerprintScreen({ navigation, route }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateHash, setTemplateHash] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');

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
          We need camera access to capture fingerprints (camera-stub demo).
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
        const h = await templateHashFromBase64(photo.base64);
        setTemplateHash(h);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!templateHash) return;
    route.params.onCaptured(templateHash);
    navigation.goBack();
  };

  return (
    <View style={[sharedStyles.screen, { padding: 0 }]}>
      <View style={styles.demoBanner}>
        <Text style={styles.demoBannerText}>
          Demo-only camera-stub fingerprint. Real matching needs a USB scanner.
        </Text>
      </View>

      {templateHash ? (
        <View style={styles.previewContainer}>
          <View style={styles.hashCard}>
            <Text style={styles.hashLabel}>Template hash (SHA-256)</Text>
            <Text style={styles.hashValue}>{shortHash(templateHash)}…</Text>
          </View>
          <View style={styles.controls}>
            <PrimaryButton
              title="Retake"
              variant="secondary"
              onPress={() => setTemplateHash(null)}
            />
            <PrimaryButton title="Use this capture" onPress={confirm} />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
          <View pointerEvents="none" style={styles.guide}>
            <View style={styles.guideBox} />
            <Text style={styles.guideText}>
              Align the attendee&apos;s finger inside the frame
            </Text>
          </View>
          <View style={styles.controls}>
            {busy ? <ActivityIndicator color="#fff" /> : null}
            <PrimaryButton title="Capture" onPress={capture} loading={busy} />
            <PrimaryButton
              title={facing === 'front' ? 'Switch to back camera' : 'Switch to front camera'}
              variant="secondary"
              onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  demoBanner: {
    backgroundColor: '#fef3c7',
    padding: spacing.sm,
  },
  demoBannerText: { color: '#92400e', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  previewContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.md },
  hashCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hashLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  hashValue: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: 'monospace' },
  controls: { gap: spacing.sm },
  guide: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  guideBox: {
    width: 220,
    height: 280,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
    opacity: 0.85,
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
