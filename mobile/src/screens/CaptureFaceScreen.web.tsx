import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
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

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
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
        video: { facingMode: { ideal: 'user' } },
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
    if (stage.kind === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        /* autoplay may require user gesture; the button will retry */
      });
    }
  }, [stage.kind]);

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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(PREVIEW_MIME, 0.8);
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

  return (
    <View style={sharedStyles.screen}>
      <View style={sharedStyles.content}>
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.heading}>Capture face</Text>
          <Text style={sharedStyles.subheading}>
            Position the attendee in the frame and tap &quot;Take photo&quot;. The
            photo is captured locally from your device&apos;s front camera.
          </Text>

          {stage.kind === 'starting' ? (
            <Text style={sharedStyles.subheading}>Opening camera…</Text>
          ) : null}

          {(stage.kind === 'live' || stage.kind === 'starting') && (
            <View style={styles.previewImage}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
              />
            </View>
          )}

          {stage.kind === 'live' ? (
            <PrimaryButton title="Take photo" onPress={takePhoto} />
          ) : null}

          {stage.kind === 'preview' ? (
            <>
              <Image
                source={{ uri: `data:${stage.mime};base64,${stage.b64}` }}
                style={styles.previewImage}
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
  previewImage: {
    width: '100%',
    height: 320,
    borderRadius: 10,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  error: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
