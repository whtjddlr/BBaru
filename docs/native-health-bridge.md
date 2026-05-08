# Native Health Bridge

BBaru 웹 코드는 `window.BBaruHealth`만 바라봅니다. iOS/Android 앱 래퍼는 이 객체를 주입하면 됩니다.

## JavaScript Contract

```ts
window.BBaruHealth = {
  isAvailable(): boolean | Promise<boolean>,
  requestPermissions(permissions: string[]): boolean | Promise<boolean>,
  readWalkingSpeedSummary(options: {
    from: string;
    to: string;
  }): {
    provider: "healthkit" | "health-connect";
    metersPerMinute?: number;
    metersPerSecond?: number;
    sampleCount?: number;
    startDate?: string;
    endDate?: string;
    updatedAt?: string;
  } | Promise<...>,
  openSettings?(): void | Promise<void>,
};
```

The app converts native values to `m/분` and stores them in the route profile as `healthWalkingMetersPerMinute`.

## iOS

Use HealthKit and read `HKQuantityTypeIdentifier.walkingSpeed`. Convert `m/s` to `m/분` before returning it to JavaScript.

Recommended payload:

```json
{
  "provider": "healthkit",
  "metersPerSecond": 1.22,
  "sampleCount": 18,
  "updatedAt": "2026-05-08T12:00:00.000Z"
}
```

## Android

Use Health Connect `SpeedRecord` and aggregate `SPEED_AVG`. Request `android.permission.health.READ_SPEED`.

Recommended payload:

```json
{
  "provider": "health-connect",
  "metersPerSecond": 1.18,
  "sampleCount": 24,
  "updatedAt": "2026-05-08T12:00:00.000Z"
}
```

## Priority

ETA calculation uses walking speed in this order:

1. Manual profile speed
2. HealthKit / Health Connect speed
3. GPS learning speed
4. Height and stride fallback
