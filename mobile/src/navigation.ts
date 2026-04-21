export type RootStackParamList = {
  Home: undefined;
  EventDashboard: { eventId: string; eventName: string };
  Register: { eventId: string; eventName: string };
  CaptureFace: { onCaptured: (base64: string) => void };
  Duplicates: { eventId: string; eventName: string };
};
