# Mobile App Documentation

## Overview

The Connex Driver Platform Mobile App is a React Native application that enables truck drivers to receive real-time load offers, communicate with dispatchers, and manage their delivery operations.

## Technology Stack

- **React Native** - Cross-platform mobile framework
- **TypeScript** - Type-safe JavaScript
- **React Navigation** - Navigation between screens
- **Axios** - HTTP client for API communication

## Project Structure

```
driverapp/
├── android/                # Android specific files
│   ├── app/               # Android app configuration
│   └── gradle/            # Gradle configuration
├── ios/                   # iOS specific files
│   ├── ConnexDriverApp/   # iOS app configuration
│   └── Podfile            # CocoaPods configuration
├── src/                   # Source code
│   ├── components/        # React Native components
│   ├── screens/           # App screens
│   ├── services/          # API and Firebase services
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── firebase.config.js     # Firebase configuration (development stage)
├── package.json           # Dependencies and scripts
└── env.example           # Environment variables template
```

## Setup Instructions

### Prerequisites

#### For iOS Development
- macOS
- Xcode 14+
- CocoaPods
- iOS Simulator or physical device

#### For Android Development
- Android Studio
- Android SDK
- Android Emulator or physical device

#### General Requirements
- Node.js 16+
- React Native CLI

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd driverapp
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp env.example .env
# Edit .env with your configuration
```

4. **iOS Setup**
```bash
cd ios
pod install
cd ..
```

5. **Start the application**

For iOS:
```bash
npx react-native run-ios
```

For Android:
```bash
npx react-native run-android
```

## Configuration

### Environment Variables

Create a `.env` file in the driverapp directory:

```bash
# API Configuration
API_BASE_URL=https://your-api-domain.com/api
API_TIMEOUT=30000

# Firebase Configuration (Public keys only) - FUTURE IMPLEMENTATION
# FIREBASE_API_KEY=your_firebase_api_key_here
# FIREBASE_AUTH_DOMAIN=connex-driver-platform.firebaseapp.com
# FIREBASE_DATABASE_URL=https://connex-driver-platform-default-rtdb.firebaseio.com/
# FIREBASE_PROJECT_ID=connex-driver-platform
# FIREBASE_STORAGE_BUCKET=connex-driver-platform.appspot.com
# FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
# FIREBASE_APP_ID=your_app_id_here

# App Identifiers
IOS_BUNDLE_ID=com.connex.driverapp
ANDROID_PACKAGE_NAME=com.connexdriverapp

# Application Settings
APP_VERSION=1.0.0
APP_ENVIRONMENT=development
APP_DEBUG=true

# Feature Flags
ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_LOCATION_TRACKING=true
ENABLE_REAL_TIME_UPDATES=true
ENABLE_OFFLINE_MODE=true
```

### Firebase Configuration

**⚠️ NOTE: Firebase integration is currently in development stage.**

The app will use Firebase for real-time features in future versions. Configuration will be in `firebase.config.js`:

```javascript
// FUTURE IMPLEMENTATION
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
```

## Features

### Authentication
- Phone number-based login
- Password setup for first-time users
- JWT token management
- Automatic session refresh

### Load Offers
**⚠️ NOTE: Load offer features are in development stage.**
- Receive load notifications via API polling
- View offer details
- Calculate distances
- Accept/reject offers

### Communication
**⚠️ NOTE: Communication features are in development stage.**
- Chat with dispatchers via API
- Message history
- File sharing

### Location Services
- GPS tracking
- Location updates
- Distance calculations

### Offline Support
- Offline data caching
- Sync when online
- Local storage

## Screens

### Authentication Screens
- **Login Screen** - Phone number and password entry
- **Password Setup** - First-time password creation
- **Forgot Password** - Password recovery

### Main Screens
- **Dashboard** - Overview of current status and offers
- **Offers List** - Available load offers (development stage)
- **Offer Details** - Detailed offer information (development stage)
- **Chat** - Communication with dispatchers (development stage)
- **Profile** - Driver information and settings

### Utility Screens
- **Settings** - App configuration
- **Help** - Support and documentation
- **About** - App information

## Components

### Core Components

#### FirebaseService
**⚠️ FUTURE IMPLEMENTATION** - Will handle Firebase operations:
- Real-time database connections
- Push notification setup
- Authentication
- Data synchronization

#### ApiService
Manages API communication:
- HTTP requests
- Authentication headers
- Error handling
- Response caching

#### LocationService
Handles location functionality:
- GPS tracking
- Location permissions
- Background location updates
- Distance calculations

### UI Components

#### OfferCard
Displays load offer information:
- Origin and destination
- Distance and pricing
- Status indicators
- Action buttons

#### ChatMessage
Individual chat message component:
- Message content
- Timestamp
- Sender information
- Message types (text, price, system)

#### StatusBar
Shows current driver status:
- Online/offline status
- Current location
- Active offers
- Notifications

## API Integration

### Authentication Flow

1. **Login Request**
```typescript
const login = async (cellPhone: string, password?: string) => {
  const response = await apiClient.post('/driver/login', {
    cellPhone,
    password
  });
  return response.data;
};
```

2. **Token Management**
```typescript
// Store token
await AsyncStorage.setItem('authToken', token);

// Add to requests
apiClient.defaults.headers.Authorization = `Bearer ${token}`;
```

### Real-time Updates

**⚠️ FUTURE IMPLEMENTATION** - Firebase integration for real-time features:

```typescript
// FUTURE: Subscribe to offers via Firebase
const unsubscribe = FirebaseService.subscribeToLoadOffers(
  driverId,
  (offers) => {
    setOffers(offers);
  }
);

// FUTURE: Send message via Firebase
await FirebaseService.sendMessage(offerId, {
  text: messageText,
  senderId: driverId,
  timestamp: Date.now()
});
```

## Push Notifications

**⚠️ FUTURE IMPLEMENTATION** - Push notifications will be implemented with Firebase Cloud Messaging.

### Setup

1. **iOS Configuration**
   - Add APNs certificates
   - Configure Firebase FCM
   - Request notification permissions

2. **Android Configuration**
   - Add google-services.json
   - Configure Firebase FCM
   - Handle notification taps

### Implementation

```typescript
// FUTURE IMPLEMENTATION
// Request permissions
const requestPermissions = async () => {
  const authStatus = await messaging().requestPermission();
  return authStatus;
};

// Handle notifications
messaging().onMessage(async (remoteMessage) => {
  // Show local notification
  showLocalNotification(remoteMessage);
});

// Handle background notifications
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // Process background notification
});
```

## Location Services

### GPS Tracking

```typescript
// Start location tracking
const startLocationTracking = async () => {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    timeInterval: 30000,
    distanceInterval: 10
  });
  
  // Update location on server
  await updateLocation(location);
};

// Background location updates
Location.startLocationUpdatesAsync('location-task', {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 60000,
  distanceInterval: 100
});
```

### Permissions

```typescript
// Request location permissions
const requestLocationPermission = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission denied', 'Location permission is required');
  }
};
```

## Offline Support

### Data Caching

```typescript
// Cache offers
const cacheOffers = async (offers) => {
  await AsyncStorage.setItem('cachedOffers', JSON.stringify(offers));
};

// Load cached data
const loadCachedOffers = async () => {
  const cached = await AsyncStorage.getItem('cachedOffers');
  return cached ? JSON.parse(cached) : [];
};
```

### Sync Strategy

```typescript
// Sync when online
const syncData = async () => {
  if (isOnline()) {
    const pendingActions = await getPendingActions();
    for (const action of pendingActions) {
      await performAction(action);
    }
  }
};
```

## Testing

### Unit Testing
```bash
npm test
```

### Integration Testing
```bash
npm run test:integration
```

### E2E Testing
```bash
# iOS
npm run test:e2e:ios

# Android
npm run test:e2e:android
```

## Build and Deployment

### Development Build

#### iOS
```bash
npx react-native run-ios --configuration Debug
```

#### Android
```bash
npx react-native run-android --variant debug
```

### Production Build

#### iOS
```bash
cd ios
xcodebuild -workspace ConnexDriverApp.xcworkspace -scheme ConnexDriverApp -configuration Release archive -archivePath ConnexDriverApp.xcarchive
```

#### Android
```bash
cd android
./gradlew assembleRelease
```

### App Store Deployment

1. **iOS App Store**
   - Archive in Xcode
   - Upload to App Store Connect
   - Submit for review

2. **Google Play Store**
   - Generate signed APK
   - Upload to Google Play Console
   - Submit for review

## Performance Optimization

### Bundle Optimization
- Enable Hermes engine
- Configure ProGuard for Android
- Optimize images and assets
- Enable code splitting

### Memory Management
- Proper component cleanup
- Image optimization
- Background task management
- Memory leak prevention

## Security

### Data Protection
- Secure storage for sensitive data
- Network security (HTTPS)
- Certificate pinning
- Input validation

### Privacy
- Location data handling
- User consent management
- Data retention policies
- GDPR compliance

## Troubleshooting

### Common Issues

1. **Build Errors**
   - Clear build cache
   - Update dependencies
   - Check platform-specific setup

2. **Firebase Issues**
   - Verify configuration
   - Check API keys
   - Test connectivity

3. **Location Services**
   - Check permissions
   - Verify GPS settings
   - Test on physical device

### Debug Mode

Enable debug mode in .env:
```bash
APP_DEBUG=true
```

## Platform Support

### iOS
- iOS 13.0+
- iPhone and iPad
- Universal app support

### Android
- Android 6.0+ (API level 23)
- Phone and tablet
- Adaptive icon support

## Performance Metrics

- App launch time: < 3 seconds
- Screen transitions: < 300ms
- API response time: < 2 seconds
- Memory usage: < 150MB

## Support

For mobile app support and questions:
- **Email**: vlad.polishuk.biz@gmail.com
- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues 