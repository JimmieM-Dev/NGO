import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { colors, sharedStyles, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureFace'>;

type Stage =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'live' }
  | { kind: 'preview'; b64: string; mime: string }
  | { kind: 'fallback'; message: string };

const PREVIEW_MIME = 'image/jpeg';

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function CaptureFaceScreen({ navigation, route }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

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

  const startCamera = useCallback(async () => {
    setError(null);
    setAutoplayBlocked(false);
    setVideoPlaying(false);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStage({
        kind: 'fallback',
        message: 'This browser does not support camera access. Upload a photo instead.',
      });
      return;
    }
    setStage({ kind: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStage({ kind: 'live' });
    } catch (e) {
      const message =
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission was denied. Grant access and try again, or upload a photo.'
          : 'Could not open the camera on this device. You can upload a photo instead.';
      setStage({ kind: 'fallback', message });
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  // Attach the stream to the <video> element once it's mounted and we're live.
  useEffect(() => {
    if (stage.kind !== 'live') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        setAutoplayBlocked(true);
      });
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

  const takePhoto = () => {
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
    // Flip horizontally so the saved photo matches the mirrored preview users see.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(PREVIEW_MIME, 0.85);
    stopStream();
    setStage({ kind: 'preview', b64: extractBase64(dataUrl), mime: PREVIEW_MIME });
  };

  const retake = async () => {
    setError(null);
    await startCamera();
  };

  const confirm = () => {
    if (stage.kind !== 'preview') return;
    route.params.onCaptured(stage.b64);
    navigation.goBack();
  };

  const onFallbackFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      setStage({
        kind: 'preview',
        b64: extractBase64(result),
        mime: file.type || PREVIEW_MIME,
      });
    };
    reader.readAsDataURL(file);
  };

  if (Platform.OS !== 'web') return null;

  const videoStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 10,
    // Mirror the preview so the user's movements match (natural selfie behavior).
    transform: 'scaleX(-1)',
    backgroundColor: '#0f172a',
  };

  return (
    <View style={sharedStyles.screen}>
      <View style={sharedStyles.content}>
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>Capture face</Text>
          <Text style={sharedStyles.subheading}>
            Line up the attendee in the frame and tap &quot;Take photo&quot;. The
            photo is captured locally from the device&apos;s front camera.
          </Text>

          {(stage.kind === 'live' || stage.kind === 'starting') && (
            <View style={styles.previewFrame}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlaying={() => {
                  setVideoPlaying(true);
                  setAutoplayBlocked(false);
                }}
                style={videoStyle}
              />
              {stage.kind === 'starting' || !videoPlaying ? (
                <View style={styles.overlay} pointerEvents="none">
                  <Text style={styles.overlayText}>
                    {autoplayBlocked
                      ? 'Tap "Start camera" below to begin'
                      : 'Starting camera…'}
                  </Text>
                </View>
              ) : (
                <View style={styles.readyBadge} pointerEvents="none">
                  <Text style={styles.readyBadgeText}>● Live</Text>
                </View>
              )}
            </View>
          )}

          {stage.kind === 'live' && autoplayBlocked && !videoPlaying ? (
            <PrimaryButton title="Start camera" onPress={manualPlay} />
          ) : null}

          {stage.kind === 'live' && videoPlaying ? (
            <PrimaryButton title="Take photo" onPress={takePhoto} />
          ) : null}

          {stage.kind === 'preview' ? (
            <>
              <Image
                source={{ uri: `data:${stage.mime};base64,${stage.b64}` }}
                style={styles.previewFrame}
                resizeMode="cover"
              />
              <PrimaryButton title="Retake" variant="secondary" onPress={retake} />
              <PrimaryButton title="Use this capture" onPress={confirm} />
            </>
          ) : null}

          {stage.kind === 'fallback' ? (
            <>
              <Text style={sharedStyles.subheading}>{stage.message}</Text>
              <PrimaryButton title="Retry camera" variant="secondary" onPress={startCamera} />
              <PrimaryButton
                title="Upload photo instead"
                onPress={() => fallbackInputRef.current?.click()}
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>

      {/* Hidden input used only as a fallback when the camera can't be opened. */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={onFallbackFile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  previewFrame: {
    width: '100%',
    aspectRatio: 3 / 4,
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
  overlayText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  readyBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(21, 128, 61, 0.9)',
  },
  readyBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
