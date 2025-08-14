### Roles and Authorization System

This document describes how roles and authorization are implemented and enforced across the backend (PHP API), the web frontend (React), and the mobile app’s Firebase database rules.

### Roles

- **admin**: Full administrative access. Can manage users, timezone settings, sessions, analytics, trucks, distances, and dispatcher dashboards.
- **manager**: Management access. Can access analytics, dispatcher dashboards, and all dispatcher-level operations.
- **dispatcher**: Operational access. Can view and modify trucks, run distance calculations, use reverse geocoding, access dispatcher dashboards and driver updates.
- **driver**: Mobile driver access. Can use driver-specific endpoints and mobile features. No access to staff-only endpoints.

### Authentication and Tokens

There are two parallel authentication flows that both use JWTs signed with `HS256` and the `JWT_SECRET` from the environment.

- **Staff (admin/manager/dispatcher) login**: `POST /api/login`
  - Issues a JWT with payload data: `{ id, username, role, fullName }` and 7-day expiry.
  - The token is used for all web frontend API calls.

- **Driver login**: `POST /api/driver/login`
  - Issues a JWT for the driver app with payload data that includes the `role: "driver"` and driver identity details.
  - Driver-only endpoints validate that the token’s role is `driver`.

JWT structure (staff example):

```json
{
  "iat": 1730000000,
  "exp": 1730604800,
  "data": {
    "id": 1,
    "username": "user@example.com",
    "role": "dispatcher",
    "fullName": "John Doe"
  }
}
```

### Backend Enforcement (PHP API)

- Core helper: `App\Core\Auth::protect(array $allowedRoles = [])`
  - Validates the Authorization Bearer token.
  - If `$allowedRoles` is non-empty, ensures the user’s role is in the list, otherwise responds with 403.
  - If `$allowedRoles` is empty, it only checks that the token is valid (authenticated user).
  - Returns the decoded user data (`$decodedToken->data`) on success.

- Current user convenience: `App\Core\Auth::getCurrentUser()`
  - Returns the token’s `data` object or `null` if not authenticated.

- Driver token validation (driver-only endpoints):
  - Controllers like `DriverController` and `SearchController` implement `getDriverFromToken()` which decodes the JWT and explicitly enforces `role === 'driver'`.

#### Route-level role protection

Most enforcement happens centrally in `api/index.php` via `Auth::protect([...])` before dispatching to controllers. Highlights:

- Trucks: `GET /api/trucks`, `PUT/DELETE /api/trucks/{id}`, `POST /api/trucks/update|create|delete`, map and location history endpoints
  - Allowed roles: `dispatcher`, `manager`, `admin`.

- Search: `GET /api/search`, `GET /api/search/recent`
  - Any authenticated user (no role restriction).
  - Reverse geocoding `GET /api/search/reverse` requires `dispatcher`, `manager`, or `admin`.

- Distance: `POST /api/distance`, `POST /api/distance/batch`, cache-related endpoints
  - Allowed roles: `dispatcher`, `manager`, `admin`.

- Users (staff management): `GET/POST/PUT/DELETE /api/users`
  - Allowed role: `admin` only.
  - `GET /api/users/dispatchers` allowed for `dispatcher`, `manager`, `admin`.

- Dashboard and Admin tools:
  - `GET /api/dashboard/analytics`: `manager`, `admin`.
  - `GET /api/dispatcher/dashboard`: `dispatcher`, `manager`, `admin`.
  - `GET /api/dashboard/session-management`: `admin`.
  - `POST /api/dashboard/logout-user`: `admin`.

- Driver app endpoints (JWT must be a driver token):
  - `GET /api/driver/profile`, `GET /api/driver/activity-logs`, `POST /api/driver/location`, `POST /api/driver/fcm-token`, `POST /api/driver/status`, offer and chat endpoints.
  - `GET /api/driver/reverse-geocode` is validated inside the controller via driver token checks.

#### In-controller checks

While most checks are applied in the router, some controller methods consult the current user and apply role checks inline (e.g., in `DriverUpdatesController` verifying the role is one of `admin/manager/dispatcher` before allowing a status update).

### Data Model

- Table: `users`
  - Relevant fields: `id`, `username`, `password` (hashed), `full_name`, `mobile_number`, `role`, `is_active`.
  - Valid values for `role`: `admin`, `manager`, `dispatcher`. Drivers are separate from this table’s staff roles and authenticate via driver-specific flow.

### Frontend (React Web)

- Auth utilities store and read JWT + user in `localStorage`:
  - `login()` saves `token` and `user` (includes `role`).
  - `getToken()`, `getCurrentUser()`, and `isAuthenticated()` expose state.

- API client automatically attaches `Authorization: Bearer <token>` and logs the user out on `401`.

- UI role gating examples:
  - The “Admin” section/button is visible for `manager` and `admin` only.
  - `AdminPage` renders certain tabs (Sessions, DB Analytics, Timezone Settings) only for `admin`.
  - `DriverUpdates` defaults the view to the current dispatcher when `user.role === 'dispatcher'`.

### Mobile (Firebase Realtime Database Rules)

Firebase security rules also recognize roles embedded in auth tokens for cross-platform enforcement. Examples:

- Drivers can read/write their own `drivers/{driverId}` subtree.
- Staff (`dispatcher`, `manager`, `admin`) can read driver subtrees and write certain load/offer fields.

Snippet from rules:

```json
{
  "rules": {
    "drivers": {
      "$driverId": {
        ".read": "auth != null && (auth.uid == $driverId || auth.token.role == 'dispatcher' || auth.token.role == 'manager' || auth.token.role == 'admin')",
        ".write": "auth != null && (auth.uid == $driverId || auth.token.role == 'dispatcher' || auth.token.role == 'manager' || auth.token.role == 'admin')"
      }
    }
  }
}
```

Note: To use roles in Firebase rules, the authentication mechanism must mint tokens that include `auth.token.role` claim for staff users.

### How to Check or Enforce Roles in Code

- Route-level protection (preferred):

```php
use App\Core\Auth;

// Allow only admin and manager
Auth::protect(['admin', 'manager']);
Controller::action();
```

- In-controller access checks:

```php
$currentUser = App\Core\Auth::getCurrentUser();
if (!$currentUser || !in_array($currentUser->role, ['dispatcher', 'manager', 'admin'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied']);
    exit();
}
```

- Driver-only endpoints:

```php
$driver = self::getDriverFromToken(); // validates role === 'driver'
if (!$driver) { return; }
```

### Adding or Changing Roles

If you introduce a new staff role or change permissions:

- Update all route protections in `api/index.php` where `Auth::protect([...])` is called.
- Update any inline checks in controllers using `Auth::getCurrentUser()`.
- Update frontend UI gating where `user.role` controls visibility.
- Update Firebase rules if the new role should apply to mobile data access.
- Ensure the `users.role` column contains the new value and that login tokens include it.

### Error Handling and Security Notes

- Invalid or missing tokens result in `401 Unauthorized`.
- Valid tokens with insufficient role result in `403 Forbidden`.
- Tokens expire after 7 days (staff flow); frontend logs out on `401` and forces re-login.
- The JWT secret must be configured via `JWT_SECRET` env var.


