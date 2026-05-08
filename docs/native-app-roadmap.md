# BBaru Native App Roadmap

BBaru is still developed as a Vite React web app, then packaged into iOS and
Android through Capacitor.

## Current Setup

- Web build output: `dist`
- Native wrapper: Capacitor
- Android project: `android`
- iOS project: `ios`
- App id: `com.bbaru.app`
- App name: `BBaru`
- Native API fallback: `https://bbaru.vercel.app`

## Commands

```bash
npm run build
npm run app:sync
npm run app:android
npm run app:ios
```

`app:android` opens Android Studio. `app:ios` must be run on macOS with Xcode.

## Native Work Still Needed

1. Add location permission handling for Android and iOS.
2. Add background location tracking for active navigation.
3. Implement the `window.BBaruHealth` bridge described in
   `docs/native-health-bridge.md`.
4. Store completed route logs and use them to refine walking speed.
5. Test real device behavior for GPS accuracy, API CORS, and HealthKit/Health
   Connect permissions.

## ETA Priority

Walking speed should be resolved in this order:

1. Manual speed from profile
2. HealthKit / Health Connect speed
3. GPS-learned speed
4. Height and stride fallback

Transit ETA should keep using real route data first, then realtime bus/subway
arrival data when available.
