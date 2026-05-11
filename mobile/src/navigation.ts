export type RootStackParamList = {
  Home: undefined;
  EventDashboard: { eventId: string; eventName: string };
  Checkin: { eventId: string; eventName: string };
  CaptureFingerprint: { onCaptured: (templateHash: string) => void };
  Invitees: { eventId: string; eventName: string };
};
