# Supabase Migration & Implementation TODO

This checklist tracks the migration from Firebase/MySQL chat/offers to Supabase, the dispatcher frontend MVP, and mobile app bootstrap. Tackle top-to-bottom.

**CURRENT STATUS:** Phase 2 (Frontend MVP) is COMPLETE ✅. Phase 4 (Backend PHP) is COMPLETE ✅. All controllers migrated to HybridAuth ✅. Backend now Supabase-only (legacy JWT fallback removed) ✅. Working on user management system improvements and authentication consolidation.

## Phase 0 — Supabase project
- [x] Create Supabase project (org/project)
- [x] Obtain SUPABASE_URL, anon key, service role key
- [x] Store keys securely (local .env files, never commit)
- [x] Validate Service Role Key functionality

## Phase 1 — Supabase schema + RLS
- [x] Author SQL to create tables:
  - [x] `loads`
  - [x] `load_offers` (FK -> loads, driver_user_id uuid -> auth.users)
  - [x] `offer_messages` (FK -> load_offers)
  - [x] `driver_mapping` (auth_user_id uuid PK -> mysql_truck_id bigint)
  - [x] Enums: `offer_status`, `message_type`
  - [x] Indexes: load_offers(driver_user_id), offer_messages(offer_id)
- [x] Enable RLS on all tables
- [x] RLS policies:
  - [x] Driver sees only own `load_offers` and related `offer_messages`
  - [x] Dispatcher/Admin can see all (via JWT claim `role`)
  - [x] Insert `offer_messages` allowed for driver/dispatcher within offer membership
- [x] Commit schema as `supabase/schema.sql` for reproducibility

## Phase 2 — Frontend (dispatcher) MVP
- [x] Add `@supabase/supabase-js`
- [x] Create `.env` with `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`
- [x] Create `frontend/src/supabaseClient.js`
- [x] Implement dispatcher auth (Supabase email/password) + route guard
- [x] Main page (existing functionality):
  - [x] Already has drivers table with distance calculation and checkbox selection
  - [x] Add "Send Offer" button (appears when trucks selected) alongside existing Copy/Clear buttons
  - [x] "Send Offer" opens modal with pickup location (pre-filled from distance calculation) and load details form
- [x] Create Offer flow:
  - [x] Modal form with pickup location (from distance search), destination, weight, proposed cost, etc.
  - [x] Submit creates `loads` record and multiple `load_offers` (one per selected driver)
  - [x] Close modal and show success message, optionally redirect to Offers page
- [x] Offers page layout (2 panes):
  - [x] Left: Dispatcher's created offers list (from `loads` where created by current user)
  - [x] Right: Chat panel (offer details header, messages list, input, actions)
- [x] Left pane behavior:
  - [x] Show offers list by default
  - [x] Click on offer → show drivers list for that load_id in same pane
  - [x] Click on driver → open chat in right pane
  - [x] Back button when viewing drivers list
- [x] Wire data:
  - [x] Fetch `loads` created by dispatcher with join to `load_offers` for counts
  - [x] Subscribe Realtime to `load_offers` for status updates
  - [x] Show viewed/unread counts per driver in drivers list
- [x] Chat panel:
  - [x] Fetch `offer_messages` by `offer_id`
  - [x] Realtime subscription to `offer_messages`
  - [x] Send text message (insert)
  - [x] Propose price (message_type=price_offer, price_amount)
  - [x] Confirm driver (set `offer_status='accepted'`; optionally set others to `rejected` for same load)

## Phase 3 — Mobile app (after FE MVP)
- [ ] Bootstrap Expo app in `mobileapp/` (already initialized)
- [ ] Add `@supabase/supabase-js`, `expo-secure-store`, `react-navigation`
- [ ] Create `mobileapp/src/clients/supabaseClient.ts` and `.env`
- [ ] AuthContext on Supabase (session persist to SecureStore)
- [ ] OffersListScreen: query `load_offers where driver_user_id = auth.uid()` + Realtime
- [ ] OfferChatScreen: query/insert `offer_messages` by `offer_id` + Realtime
- [ ] Keep PHP endpoints only for driver profile/location/status

## Phase 4 — Backend PHP (MySQL stays for drivers only)
- [x] Implement Supabase JWT validation helper in API (HS256 with SUPABASE_JWT_SECRET or JWKS if RS256)
- [x] Protect driver endpoints (`/driver/profile`, `/driver/location`, `/driver/status`) using Supabase JWT
- [x] Use `driver_mapping` to resolve `auth_user_id -> Trucks.ID`
- [x] Deprecate/remove MySQL-based offers/messages endpoints and DB writes
- [x] Create HybridAuth.php for dual authentication support (JWT + Supabase)
- [x] Update all API endpoints to use HybridAuth::protect()
  - [x] Controllers migrated: DriverUpdates, Truck, Settings, DispatcherDashboard, Search, Distance
- [x] Implement SupabaseAuth.php for Supabase JWT validation

## Phase 5 — Purge Firebase
- [ ] Remove Firebase configs/services from repo
  - [ ] `driverapp/firebase.config.js`
  - [ ] `driverapp/src/services/firebaseSync.ts`
  - [ ] Any RN Firebase dependencies in `driverapp/package.json`
- [ ] Ensure `frontend/` has no Firebase usage
- [ ] Ensure `api/` does not validate Firebase JWT (use Supabase JWT instead)
- [ ] Update READMEs to Supabase-only

## Phase 6 — DevOps & Quality
- [ ] Add `.env.example` files
  - [x] `frontend/` (exists: `frontend/.env.example`)
  - [ ] `mobileapp/`
- [ ] Add error handling/toasts for FE and Mobile (auth/offers/chat)
- [ ] Basic tests or smoke checks for offers/messages flows
- [x] Document RBAC (driver/dispatcher/admin) and JWT claims mapping (see `docs/ROLES.md`)
 - [ ] Smoke test protected PHP endpoints with Supabase JWT (Settings, Distance, DriverUpdates, Search)
 - [ ] Verify phone masking logic in `TruckController` respects holds per current user

## Phase 7 — User Management System (NEW)
- [x] **User Authentication Migration Complete**
  - [x] Create HybridAuthContext.js for dual auth support (JWT + Supabase)
  - [x] Implement seamless authentication fallback system
  - [x] Update frontend to use HybridAuthContext exclusively
  - [x] Test authentication with both MySQL and Supabase users

- [x] **User Management Interface**
  - [x] Create SessionManagement.js component for user administration
  - [x] Implement user creation via Supabase Admin API
  - [x] Implement user editing and role management
  - [x] Add user deletion functionality
  - [x] Real-time user list updates

- [x] **Modal System Redesign**
  - [x] Complete redesign of UserModal.js with modern UI/UX
  - [x] Advanced form validation (email, username, password strength)
  - [x] Password visibility toggles and confirmation fields
  - [x] Responsive design for mobile/tablet
  - [x] Loading states and error handling
  - [x] Accessibility improvements (ARIA labels, proper IDs)

- [ ] **Authentication System Consolidation (CRITICAL ISSUES)**
  - [ ] **Fix ActivityLogger compatibility** - Currently breaks for Supabase users
  - [ ] **Standardize user display names** - Inconsistent username/full_name usage
  - [ ] **Resolve dual database architecture** - MySQL vs Supabase user storage
  - [ ] **Fix logging system** - Uses MySQL user_id format, incompatible with Supabase UUIDs
  - [ ] **Create unified user service** - Single interface for user data access

  Notes:
  - Controllers call `HybridAuth::getCurrentUser()`; ActivityLogger uses HybridAuth too. Verify payload shapes (id, username) for Supabase user object.
  - Legacy JWT fallback removed; proceed to delete `api/src/Core/Auth.php` and Firebase artifacts.

**IDENTIFIED PROBLEMS:**
1. **Logging System Broken** - ActivityLogger.php uses MySQL user IDs, fails for Supabase users
2. **Inconsistent User Display** - Some places use username, others full_name, different formats
3. **Username Login Issue** - Supabase requires email, current system uses username@connexlogistics.com hack
4. **Dual Database Complexity** - No synchronization between MySQL and Supabase user stores

**RECOMMENDED SOLUTIONS:**
- **Option A:** Complete migration to Supabase (clean, but requires full migration)
- **Option B:** Hybrid system with user mapping table (complex, but gradual)
- **Option C:** Dual logging system (maintains compatibility, adds complexity)

## Notes
- Source of truth split:
  - Supabase: offers, messages, loads, user authentication
  - MySQL: drivers (profile, location, status) + extended logs
- Start with simple policies; refine dispatcher role enforcement via JWT claims when accounts are ready.
