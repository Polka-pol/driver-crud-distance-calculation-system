# Firebase Setup Guide

## Overview

**⚠️ NOTE: Firebase integration is currently in development stage and not yet implemented in the production code.**

This guide covers the planned Firebase setup for future real-time features, authentication, and push notifications for the Driver CRUD Distance Calculation System.

## Firebase Services Used

- **Realtime Database** - Real-time data synchronization
- **Authentication** - User authentication and authorization
- **Cloud Messaging (FCM)** - Push notifications
- **Firestore** - Document database (optional)

## Project Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project details:
   - **Project name**: `Driver CRUD Distance Calculation System`
   - **Project ID**: `driver-crud-distance-calculation-system`
   - **Google Analytics**: Enable (recommended)

### 2. Enable Required Services

#### Realtime Database
1. In Firebase Console, go to "Realtime Database"
2. Click "Create Database"
3. Choose location: `us-central1` (default)
4. Start in test mode (we'll add security rules later)

#### Authentication
1. Go to "Authentication" → "Sign-in method"
2. Enable "Custom" authentication
3. Add authorized domains:
   - `localhost` (for development)
   - `your-domain.com` (for production)

#### Cloud Messaging
1. Go to "Project Settings" → "Cloud Messaging"
2. Note the **Sender ID** and **Server Key**
3. Configure for iOS and Android platforms

## Configuration Files

### 1. Service Account (Backend)

For the PHP backend, you need a service account:

1. Go to "Project Settings" → "Service Accounts"
2. Click "Generate new private key"
3. Download the JSON file
4. Save as `api/config/firebase-service-account.json`

**Important**: Never commit this file to version control!

### 2. iOS Configuration

1. In Firebase Console, go to "Project Settings" → "General"
2. Click "Add app" → "iOS"
3. Enter bundle ID: `com.connex.driverapp`
4. Download `GoogleService-Info.plist`
5. Add to iOS project

### 3. Android Configuration

1. In Firebase Console, go to "Project Settings" → "General"
2. Click "Add app" → "Android"
3. Enter package name: `com.connexdriverapp`
4. Download `google-services.json`
5. Add to Android project

## Security Rules

### Realtime Database Rules

Create `firebase-database-rules.json`:

```json
{
  "rules": {
    "drivers": {
      "$driverId": {
        ".read": "auth != null && auth.uid == $driverId",
        ".write": "auth != null && auth.uid == $driverId",
        "offers": {
          ".read": "auth != null && auth.uid == $driverId",
          ".write": "auth != null && auth.uid == $driverId"
        },
        "location": {
          ".read": "auth != null && auth.uid == $driverId",
          ".write": "auth != null && auth.uid == $driverId"
        },
        "fcm_token": {
          ".read": "auth != null && auth.uid == $driverId",
          ".write": "auth != null && auth.uid == $driverId"
        }
      }
    },
    "chats": {
      "$offerId": {
        ".read": "auth != null && (root.child('offers').child($offerId).child('driver_id').val() == auth.uid || root.child('offers').child($offerId).child('dispatcher_id').val() == auth.uid)",
        ".write": "auth != null && (root.child('offers').child($offerId).child('driver_id').val() == auth.uid || root.child('offers').child($offerId).child('dispatcher_id').val() == auth.uid)",
        "messages": {
          "$messageId": {
            ".read": "auth != null && (root.child('offers').child($offerId).child('driver_id').val() == auth.uid || root.child('offers').child($offerId).child('dispatcher_id').val() == auth.uid)",
            ".write": "auth != null && (root.child('offers').child($offerId).child('driver_id').val() == auth.uid || root.child('offers').child($offerId).child('dispatcher_id').val() == auth.uid)"
          }
        }
      }
    },
    "offers": {
      "$offerId": {
        ".read": "auth != null && (data.child('driver_id').val() == auth.uid || data.child('dispatcher_id').val() == auth.uid)",
        ".write": "auth != null && (data.child('driver_id').val() == auth.uid || data.child('dispatcher_id').val() == auth.uid)"
      }
    }
  }
}
```

### Deploy Rules

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init

# Deploy rules
firebase deploy --only database
```

## Backend Integration (PHP)

### 1. Install Firebase Admin SDK

```bash
cd api
composer require kreait/firebase-php
```

### 2. Initialize Firebase

```php
// api/src/Core/Firebase.php
<?php

namespace App\Core;

use Kreait\Firebase\Factory;
use Kreait\Firebase\ServiceAccount;

class Firebase
{
    private static $firebase;

    public static function getInstance()
    {
        if (!self::$firebase) {
            $serviceAccount = ServiceAccount::fromJsonFile(
                __DIR__ . '/../../config/firebase-service-account.json'
            );

            self::$firebase = (new Factory)
                ->withServiceAccount($serviceAccount)
                ->withDatabaseUri($_ENV['FIREBASE_DATABASE_URL'])
                ->create();
        }

        return self::$firebase;
    }

    public static function getDatabase()
    {
        return self::getInstance()->getDatabase();
    }

    public static function getAuth()
    {
        return self::getInstance()->getAuth();
    }
}
```

### 3. Environment Variables

Add to `api/.env`:

```bash
FIREBASE_PROJECT_ID=connex-driver-platform
FIREBASE_DATABASE_URL=https://connex-driver-platform-default-rtdb.firebaseio.com/
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@connex-driver-platform.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
```

## Mobile App Integration

### 1. Install Dependencies

```bash
cd driverapp
npm install @react-native-firebase/app @react-native-firebase/database @react-native-firebase/messaging @react-native-firebase/auth
```

### 2. iOS Setup

```bash
cd ios
pod install
cd ..
```

### 3. Android Setup

Add to `android/app/build.gradle`:

```gradle
apply plugin: 'com.google.gms.google-services'
```

Add to `android/build.gradle`:

```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.3.15'
    }
}
```

### 4. Configuration

Update `firebase.config.js`:

```javascript
import { initializeApp } from '@react-native-firebase/app';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const database_ref = database();
export const messaging_ref = messaging();
export const auth_ref = auth();
```

## Push Notifications

### 1. iOS Setup

#### APNs Configuration
1. In Apple Developer Console, create APNs Auth Key
2. Download the key file
3. In Firebase Console → Project Settings → Cloud Messaging:
   - Upload APNs Auth Key
   - Enter Key ID and Team ID

#### iOS App Configuration
Add to `ios/ConnexDriverApp/AppDelegate.mm`:

```objc
#import <UserNotifications/UserNotifications.h>
#import <RNCPushNotificationIOS.h>

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Request permission
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;
  
  return YES;
}

- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  [FIRMessaging messaging].APNSToken = deviceToken;
}
```

### 2. Android Setup

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<service
    android:name=".java.MyFirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### 3. Send Notifications

From PHP backend:

```php
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification;

$messaging = Firebase::getInstance()->getMessaging();

$message = CloudMessage::withTarget('token', $fcmToken)
    ->withNotification(Notification::create('New Offer', 'You have a new load offer'))
    ->withData(['offer_id' => '123']);

$messaging->send($message);
```

## Data Structure

### Realtime Database Schema

```json
{
  "drivers": {
    "driver_123": {
      "offers": {
        "offer_456": {
          "id": "offer_456",
          "load_id": "load_789",
          "status": "sent",
          "created_at": 1704067200000
        }
      },
      "location": {
        "latitude": 32.7767,
        "longitude": -96.7970,
        "city_state_zip": "Dallas, TX 75201",
        "updated_at": 1704067200000
      },
      "fcm_token": "fcm_token_here",
      "status": "Available"
    }
  },
  "chats": {
    "offer_456": {
      "messages": {
        "msg_001": {
          "id": "msg_001",
          "sender_type": "driver",
          "sender_id": "driver_123",
          "message_text": "I can do this for $2,750",
          "message_type": "price_offer",
          "price_amount": 2750.00,
          "created_at": 1704067200000
        }
      },
      "metadata": {
        "unread_count_driver": 0,
        "unread_count_dispatcher": 1,
        "last_message_at": 1704067200000
      }
    }
  }
}
```

## Testing

### 1. Test Database Rules

```bash
# Test read access
curl -X GET "https://connex-driver-platform-default-rtdb.firebaseio.com/drivers/driver_123.json?auth=YOUR_AUTH_TOKEN"

# Test write access
curl -X PUT "https://connex-driver-platform-default-rtdb.firebaseio.com/drivers/driver_123/location.json?auth=YOUR_AUTH_TOKEN" \
  -d '{"latitude": 32.7767, "longitude": -96.7970}'
```

### 2. Test Push Notifications

```bash
# Send test notification
curl -X POST "https://fcm.googleapis.com/fcm/send" \
  -H "Authorization: key=YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "DEVICE_TOKEN",
    "notification": {
      "title": "Test Notification",
      "body": "This is a test message"
    }
  }'
```

## Monitoring

### 1. Firebase Console
- Monitor database usage
- Track authentication events
- View push notification delivery
- Analyze crash reports

### 2. Analytics
- User engagement metrics
- Feature usage tracking
- Performance monitoring
- Error tracking

## Security Best Practices

### 1. Service Account Security
- Store service account key securely
- Use environment variables
- Never commit keys to version control
- Rotate keys regularly

### 2. Database Security
- Implement proper security rules
- Validate data on server side
- Use authentication for all operations
- Monitor access patterns

### 3. Push Notifications
- Validate FCM tokens
- Handle token refresh
- Implement rate limiting
- Monitor delivery rates

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check service account configuration
   - Verify database URL
   - Check security rules

2. **Push Notification Issues**
   - Verify APNs configuration (iOS)
   - Check FCM setup (Android)
   - Validate device tokens

3. **Authentication Problems**
   - Check custom token generation
   - Verify authorized domains
   - Test authentication flow

### Debug Mode

Enable Firebase debug mode:

```javascript
// In development
if (__DEV__) {
  firebase.database().setLoggingEnabled(true);
}
```

## Support

For Firebase-related issues:
- **Firebase Documentation**: [firebase.google.com/docs](https://firebase.google.com/docs)
- **Firebase Support**: [firebase.google.com/support](https://firebase.google.com/support)
- **Community**: [stackoverflow.com/questions/tagged/firebase](https://stackoverflow.com/questions/tagged/firebase) 