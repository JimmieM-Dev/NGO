import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type Facing = 'user' | 'environment';

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
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Default to the back camera so the person registering attendees can simply
  // point the device at them; operators can flip to the front camera if they
  // prefer selfies or are using a laptop with only one webcam.
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

  const startCamera = useCallback(async (requested?: Facing) => {
    const desired: Facing = requested ?? facingRef.current;
    setError(null);
    setAutoplayBlocked(false);
    setVideoPlaying(false);
    stopStream();
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
          ? 'Camera permission was denied. Grant access and try again, or upload a photo.'
          : 'Could not open the camera on this device. You can upload a photo instead.';
      setStage({ kind: 'fallback', message });
    }
  }, [stopStream]);

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
    // Only mirror the saved photo when using the front camera so that it matches
    // the mirrored preview; the back camera is not mirrored.
    if (facingRef.current === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(PREVIEW_MIME, 0.85);
    stopStream();
    setStage({ kind: 'preview', b64: extractBase64(dataUrl), mime: PREVIEW_MIME });
  };

  const retake = async () => {
    setError(null);
    await startCamera(facingRef.current);
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
    // Mirror only the front camera preview for natural selfie behavior.
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
      <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>Capture face</Text>
          <Text style={sharedStyles.subheading}>
            Line up the attendee in the frame and tap &quot;Take photo&quot;. Use
            &quot;Switch camera&quot; to flip between the front and back cameras.
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
                onError={() => setError('Video element error — try "Retry camera" or upload a photo.')}
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

          {stage.kind === 'live' && videoPlaying ? (
            <Text style={styles.debugLine}>
              Live camera: {videoDims.w}×{videoDims.h}. If the preview looks dark,
              open your laptop&apos;s webcam cover or improve lighting.
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
          {stage.kind === 'live' && !videoPlaying ? (
            <>
              <PrimaryButton title="Retry camera" variant="secondary" onPress={retake} />
              <PrimaryButton
                title="Upload photo instead"
                onPress={() => fallbackInputRef.current?.click()}
              />
            </>
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
              <PrimaryButton title="Retry camera" variant="secondary" onPress={() => startCamera()} />
              <PrimaryButton
                title="Upload photo instead"
                onPress={() => fallbackInputRef.current?.click()}
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollPad: {
    paddingBottom: spacing.xl,
  },
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
  debugLine: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'monospace',
  },
});
