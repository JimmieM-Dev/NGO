# NGO Biometric Mobile App

Expo React Native (TypeScript) app for field operators. Lets a single device run a
sensitization event: create the event, enroll attendees with a fingerprint photo +
national ID + phone, and surface duplicate alerts immediately.

## Install

```bash
cd mobile
npm install
```

## Run

```bash
npx expo start            # tunnel / LAN
npx expo start --web      # runs in the browser (uses getUserMedia for camera)
npx expo start --android  # Android emulator / device
```

## Configuration

The backend URL is resolved in this order:

1. `EXPO_PUBLIC_API_BASE_URL` env var, e.g.
   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8000 npx expo start
   ```
2. `expo.extra.apiBaseUrl` in `app.json`.
3. Fallback: `http://localhost:8000`.

On a physical device you must use your host machine's LAN IP — `localhost` on the phone
resolves to the phone itself.

## Type check

```bash
npx tsc --noEmit
```
