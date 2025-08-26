# Connex Driver Mobile App — Technical Overview (Context)

This document summarizes the driver mobile application located in `driverapp/`. It is intended to be used as contextual reference for development and integration work.

## Project Summary

- The app is a React Native application created with `@react-native-community/cli`.
- Written in TypeScript (see `tsconfig.json`) with modern RN versions:
  - React: `19.1.0`
  - React Native: `0.80.1`
  - React Navigation v7 (`@react-navigation/native`, `@react-navigation/stack`, `@react-navigation/bottom-tabs`).
- State/auth handled via a custom context in `src/context/AuthContext.tsx` with persistence in `@react-native-async-storage/async-storage`.
- Networking uses `axios` with request/response interceptors in `src/services/api.ts`.
- Real-time features and notifications powered by Firebase (`@react-native-firebase/app`, `database`, `messaging`, `auth`).
- Native iOS/Android projects included under `ios/` and `android/` (with CocoaPods via `Gemfile`).

## Directory Structure (key parts)

- `driverapp/package.json` — scripts and dependencies.
- `driverapp/README.md` — RN CLI run instructions.
- `driverapp/API_ENDPOINTS.md` — API contract for mobile and admin endpoints.
- `driverapp/firebase.config.js` — Firebase initialization and helpers.
- `driverapp/src/`
  - `context/AuthContext.tsx` — auth state, session restore, login, logout, password setup.
  - `services/api.ts` — HTTP client and API methods.
  - `services/firebaseSync.ts` — synchronization of offers, chats, FCM token, and driver location with Firebase and backend.
  - `navigation/AppNavigator.tsx` — navigation stack and auth gating.
  - `screens/` — UI screens such as `LoginScreen`, `SetPasswordScreen`, `HomeScreen`, `LocationUpdateScreen`, `LoadOffersScreen`, `LoadDetailsScreen`, `ProfileScreen`.
  - `components/StatusBadge.tsx` — small UI components.
  - `types/index.ts` — shared TS types (Driver, LoadOffer, ApiResponse, navigation types, etc.).
  - `utils/time.ts` — time formatting and timezone support.

## Authentication & Session

- JWT-based auth. Tokens stored in `AsyncStorage` under `authToken`; driver data stored under `driver`.
- `src/services/api.ts`
  - Adds `Authorization: Bearer <token>` header if token exists (request interceptor).
  - On `401` responses, clears stored auth data (response interceptor).
- `src/context/AuthContext.tsx`
  - Restores session on app start (loads token and driver from `AsyncStorage`).
  - Login flow supports “first-time login” (no password) with a follow-up password setup.
  - Exposes methods: `login`, `setPassword`, `logout`, `updateDriver`, and `passwordSetupComplete`.
- Navigation guard in `src/navigation/AppNavigator.tsx` toggles between auth screens and main app based on auth state and password setup requirement.

## API Base and Endpoints

- Base URL: `https://connex.team/api` (hardcoded in `src/services/api.ts`).
- Endpoints defined and documented in `driverapp/API_ENDPOINTS.md`. Implemented client methods include:
  - Auth
    - POST `/driver/login` — first-time login (no password) or regular login.
    - POST `/driver/set-password` — complete first-time setup.
  - Driver Profile
    - GET `/driver/profile` — fetch driver profile.
    - POST `/driver/profile` — update driver profile (partial payloads allowed).
    - POST `/driver/status` — update driver status.
  - Location
    - POST `/driver/location` — update `cityStateZip`, latitude, longitude.
    - GET `/driver/reverse-geocode?lat=..&lon=..` — reverse geocode GPS coordinates.
  - FCM
    - POST `/driver/fcm-token` — update driver’s FCM token.
  - Load Offers
    - GET `/driver/load-offers` — list offers.
    - POST `/driver/load-offers/respond` — respond to an offer.
  - Utility
    - GET `/settings/timezone` — fetch app timezone (used for display formatting).
    - GET `/health` — connection test.

Notes:
- `API_ENDPOINTS.md` also documents admin/dispatcher endpoints under `/loads` (create, list, send-offers, offers details). These are primarily for the web/admin side but useful for context.
- Payload naming may differ slightly between docs and implementation for the respond endpoint:
  - Docs: `{ "offerId", "action", "counterOfferAmount" }`.
  - Implementation (`src/services/api.ts`): `{ offer_id, response, counter_amount }`.

## Location Handling

- Address format enforced in UI: "City, ST ZIP". See `driverapp/API_ENDPOINTS.md` and regex validation in `src/screens/LocationUpdateScreen.tsx`.
- Screen provides two flows:
  - Manual entry with validation and update via `/driver/location`.
  - GPS-assisted: obtains coordinates via `@react-native-community/geolocation`, then calls `/driver/reverse-geocode` to fill the address.

## Firebase Integration

- Initialization and helpers in `driverapp/firebase.config.js`:
  - `initializeApp`, `database()`, `messaging()`, `auth()`.
  - Exposes `database_ref`, `messaging_ref`, and `FirebaseService` utility object for subscribing, sending messages, and updating offer status.
- Higher-level synchronization in `src/services/firebaseSync.ts`:
  - Offer sync: fetches from backend and writes to Firebase DB nodes under `drivers/{driverId}/offers`, `offers/{offerId}`, and related `loads/*` nodes.
  - Offer updates: updates both Firebase and backend.
  - Chat subsystem: real-time messages under `chats/{offerId}/messages`, with unread counters in metadata.
  - Driver location: updates at `drivers/{driverId}/location`.
  - FCM token: stored in Firebase and mirrored to backend.

## Types and Models (selected)

- `Driver` (see `src/types/index.ts`): includes identifiers and operational fields like `CityStateZip`, `Status`, coordinates, FCM token, etc.
- `Load` and `LoadOffer`: capture offer status lifecycle — `pending | accepted | rejected | counter_offer` — and associated load metadata.
- `ApiResponse<T>`: common `{ success: boolean; message: string; data?: T }` envelope.

## UI/Navigation

- `AppNavigator` controls stacks:
  - Auth screens: `Login`, `SetPassword`.
  - Main screens: `Home`, `LocationUpdate`, `LoadOffers`, `LoadDetails`, `Profile`.
- `LocationUpdateScreen` highlights last known address/time, supports GPS lookup, and formats timestamps via `utils/time.ts`.

## Security Considerations

- All protected calls require a valid JWT in `Authorization` header; missing/invalid/expired tokens result in `401` and local logout.
- Role-based separation exists at the API layer (per `API_ENDPOINTS.md`): driver endpoints under `/driver/*` enforce role `driver`.

## Tooling

- Linting/formatting: ESLint (`.eslintrc.js`) and Prettier (`.prettierrc.js`).
- Testing: Jest configured via `jest.config.js` and tests in `__tests__/`.
- iOS CocoaPods: managed with `Gemfile`/`Gemfile.lock`.

## Scripts

- `npm start` — Metro bundler.
- `npm run android` — build/run Android.
- `npm run ios` — build/run iOS.
- `npm test` — run Jest tests.

## Environment

- `env.example` includes example environment variables expected by the app (review and create `.env` as needed).

## Known Integration Notes

- Ensure Firebase config values in `firebase.config.js` are set for the target environment (API keys, app IDs, bundle IDs/package names).
- Verify payload keys for offer responses align with backend expectations (see “Notes” under API section).
- Location formatting must follow "City, ST ZIP"; reverse geocode helps prefill but ZIP may be `null` in some cases per the API response.

## Base URLs Summary

- Backend API: `https://connex.team/api` (client default; can be changed via `ApiService.setBaseURL`).
- Firebase Realtime Database: `https://connex-driver-platform-default-rtdb.firebaseio.com/` (from `firebase.config.js`).

This overview reflects the repository at the time of writing and should be updated if endpoints, payloads, or app structure change.
