import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { templateHashFromBase64, shortHash } from '../fingerprint';
import { colors, sharedStyles, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureFingerprint'>;

type Stage =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'live' }
  | { kind: 'computing' }
  | { kind: 'preview'; templateHash: string }
  | { kind: 'fallback'; message: string };

type Facing = 'user' | 'environment';

const PREVIEW_MIME = 'image/jpeg';

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function CaptureFingerprintScreen({ navigation, route }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Back camera by default so the operator can point the device at the
  // attendee's finger directly.
  const [facing, setFacing] = useState<Facing>('environment');
  const facingRef = useRef<Facing>('environment');

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoPlaying(false);
  }, []);

  const startCamera = useCallback(
    async (requested?: Facing) => {
      const desired: Facing = requested ?? facingRef.current;
      setError(null);
      setAutoplayBlocked(false);
      setVideoPlaying(false);
      stopStream();
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStage({
          kind: 'fallback',
          message: 'This browser does not support camera access. Upload an image instead.',
        });
        return;
      }
      setStage({ kind: 'starting' });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: desired },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        facingRef.current = desired;
        setFacing(desired);
        setStage({ kind: 'live' });
      } catch (e) {
        const message =
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Camera permission was denied. Grant access and try again, or upload an image.'
            : 'Could not open the camera on this device. You can upload an image instead.';
        setStage({ kind: 'fallback', message });
      }
    },
    [stopStream],
  );

  useEffect(() => {
    void startCamera();
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = useCallback(async () => {
    const next: Facing = facingRef.current === 'user' ? 'environment' : 'user';
    await startCamera(next);
  }, [startCamera]);

  useEffect(() => {
    if (stage.kind !== 'live') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => setAutoplayBlocked(true));
    }
  }, [stage.kind]);

  const manualPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().then(
      () => setAutoplayBlocked(false),
      () => setAutoplayBlocked(true),
    );
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError('Camera is not ready yet. Try again in a moment.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture a frame from the camera.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(PREVIEW_MIME, 0.85);
    stopStream();
    setStage({ kind: 'computing' });
    try {
      const templateHash = await templateHashFromBase64(extractBase64(dataUrl));
      setStage({ kind: 'preview', templateHash });
    } catch {
      setError('Failed to hash the captured image.');
      setStage({ kind: 'fallback', message: 'Could not hash that capture. Try again.' });
    }
  };

  const retake = async () => {
    setError(null);
    await startCamera(facingRef.current);
  };

  const confirm = () => {
    if (stage.kind !== 'preview') return;
    route.params.onCaptured(stage.templateHash);
    navigation.goBack();
  };

  const onFallbackFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setStage({ kind: 'computing' });
    const reader = new FileReader();
    reader.onerror = () => setError('Failed to read image.');
    reader.onload = async () => {
      const result = reader.result as string;
      const b64 = extractBase64(result);
      try {
        const templateHash = await templateHashFromBase64(b64);
        setStage({ kind: 'preview', templateHash });
      } catch {
        setError('Failed to hash the image.');
        setStage({ kind: 'fallback', message: 'Could not hash that image. Try again.' });
      }
    };
    reader.readAsDataURL(file);
  };

  if (Platform.OS !== 'web') return null;

  const videoStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 10,
    transform: facing === 'user' ? 'scaleX(-1)' : 'none',
    backgroundColor: '#ffffff',
    display: 'block',
  };

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={[sharedStyles.content, styles.scrollPad]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.demoBanner}>
        <Text style={styles.demoBannerTitle}>Demo-only fingerprint capture</Text>
        <Text style={styles.demoBannerBody}>
          This camera-stub hashes the image bytes. Two scans of the same finger
          will NOT match. Real biometric matching needs a USB fingerprint
          scanner (e.g. Mantra MFS100). Use the same image to demo cross-event
          recognition.
        </Text>
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.heading}>Capture fingerprint</Text>
        <Text style={sharedStyles.subheading}>
          Point the camera at the attendee&apos;s finger and tap &quot;Take photo&quot;.
          Use &quot;Switch camera&quot; to flip between front and back cameras.
        </Text>

        {(stage.kind === 'live' || stage.kind === 'starting') && (
          <View style={styles.previewFrame}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setVideoDims({ w: v.videoWidth, h: v.videoHeight });
              }}
              onPlaying={(e) => {
                const v = e.currentTarget;
                setVideoDims({ w: v.videoWidth, h: v.videoHeight });
                setVideoPlaying(true);
                setAutoplayBlocked(false);
              }}
              onError={() => setError('Video element error — try "Retry camera" or upload an image.')}
              style={videoStyle}
            />
            {stage.kind === 'starting' || !videoPlaying ? (
              <View style={styles.overlay} pointerEvents="none">
                <Text style={styles.overlayText}>
                  {autoplayBlocked ? 'Tap "Start camera" below to begin' : 'Starting camera…'}
                </Text>
              </View>
            ) : (
              <View style={styles.readyBadge} pointerEvents="none">
                <Text style={styles.readyBadgeText}>● Live</Text>
              </View>
            )}
          </View>
        )}

        {stage.kind === 'live' && videoPlaying ? (
          <Text style={styles.debugLine}>
            Live camera: {videoDims.w}×{videoDims.h}
          </Text>
        ) : null}

        {stage.kind === 'live' && autoplayBlocked && !videoPlaying ? (
          <PrimaryButton title="Start camera" onPress={manualPlay} />
        ) : null}

        {stage.kind === 'live' && videoPlaying ? (
          <>
            <PrimaryButton title="Take photo" onPress={takePhoto} />
            <PrimaryButton
              title={facing === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
              variant="secondary"
              onPress={switchCamera}
            />
          </>
        ) : null}

        {stage.kind === 'computing' ? (
          <Text style={sharedStyles.subheading}>Hashing capture…</Text>
        ) : null}

        {stage.kind === 'preview' ? (
          <>
            <View style={styles.hashCard}>
              <Text style={styles.hashLabel}>Template hash (SHA-256)</Text>
              <Text style={styles.hashValue}>{shortHash(stage.templateHash)}…</Text>
            </View>
            <PrimaryButton title="Retake" variant="secondary" onPress={retake} />
            <PrimaryButton title="Use this capture" onPress={confirm} />
          </>
        ) : null}

        {stage.kind === 'fallback' ? (
          <>
            <Text style={sharedStyles.subheading}>{stage.message}</Text>
            <PrimaryButton title="Retry camera" variant="secondary" onPress={() => startCamera()} />
            <PrimaryButton
              title="Upload image instead"
              onPress={() => fallbackInputRef.current?.click()}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFallbackFile}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollPad: { paddingBottom: spacing.xl },
  demoBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    gap: 4,
  },
  demoBannerTitle: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  demoBannerBody: { fontSize: 13, color: '#92400e' },
  previewFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 360,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  overlayText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  readyBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(21, 128, 61, 0.9)',
  },
  readyBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  error: { color: colors.danger, marginTop: spacing.xs },
  debugLine: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
  hashCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: spacing.md,
    gap: 4,
  },
  hashLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  hashValue: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: 'monospace' },
});
