### RBAC Implementation To-Do

This checklist tracks remaining work to fully implement flexible, non-hardcoded roles and permissions across the stack.

### Database

- [x] Create RBAC tables: `roles`, `permissions`, `role_permissions` (setup_rbac.sql)
- [x] Ensure `roles.is_system` and `roles.is_active` exist (added via ALTER) and seed system roles
- [x] Seed permission catalog and baseline mappings (manager/dispatcher)
- [ ] Add DB indexes if needed: `permissions.key`, `role_permissions(role_id)`, `role_permissions(permission_id)`
- [ ] Add minimal data migrations for existing users if role normalization is required (optional)

### Backend (API)

- [x] Introduce `Authz` service with DB-backed permissions and fallback map
- [x] Treat `admin` as superuser in `Authz::can`
- [x] Add RBAC management endpoints: `/rbac/permissions`, `/rbac/roles`, `/rbac/roles/{id}`, `/rbac/roles/{id}/permissions`, `/me/permissions`
- [x] Start replacing hardcoded role arrays with permission checks in `api/index.php`
- [x] Replace role-array checks with `Authz::require/requireAny` for trucks, distance (batch/cache), timezone update, holds
- [x] Normalize in-controller checks to use `Authz` for driver updates (keep driver-only JWT checks elsewhere)
- [ ] Add simple in-memory cache/TTL for role->permissions within process lifetime (optional, current per-request cache exists)
- [x] Add audit logs on RBAC changes (create/update/delete role, set permissions)
- [ ] Add unit/integration tests for permission gates and RBAC endpoints

### Frontend (Web)

- [x] Add `PermissionsProvider` and fetch `/me/permissions` on login/app init
- [x] Gate Admin entry by `dashboard.analytics.view`
- [ ] Gate UI elements by specific permissions:
  - Trucks table actions (edit/create/delete/holds): `trucks.update`, `trucks.create`, `trucks.delete`, `trucks.hold.manage`
    - EditModal: Save (trucks.update), Delete (trucks.delete), Set No Update (driver.updates.modify) [gated]
    - NewDriverModal: create gated (`trucks.create`) [gated]
  - Map view: `trucks.map.view` (MapPage gated)
  - Location/history modals: `trucks.history.read` (LocationHistoryModal gated)
  - Distance actions: `distance.process`, `distance.batch`
    - Frontend guard added in distanceCalculator (requires distance.process/batch) [gated]
  - Driver Updates page/toggles: `driver.updates.view`, `driver.updates.modify` (header button gated; HoldCell gated)
  - Timezone settings tabs: `settings.timezone.view`, `settings.timezone.update`
  - Users management pages: `users.manage`, `users.dispatchers.read`
  - ActivityDashboard: analytics gated (`dashboard.analytics.view`) [gated]
  - SessionManagement: sessions.manage for view/logout; users.manage for CRUD [gated]
  - Admin page tabs: sessions (sessions.manage), db-analytics (dashboard.analytics.view), timezone (settings.timezone.view) [gated]
- [ ] Add a lightweight admin UI for RBAC:
  - [x] Roles list (create/delete)
  - [x] Role detail: permission matrix toggle (read catalog from `/rbac/permissions`)
  - [x] Rename/activate/deactivate roles
  - [ ] Show assigned permissions summary and audit log excerpts
- [ ] Handle 403 gracefully (toasts + conditional UI)

### Mobile / Firebase

- [ ] Decide on staff claims exposure in Firebase (recommended: avoid dynamic claims; route sensitive actions via API)
- [ ] Ensure driver app behavior remains unchanged; keep `driver` token validation

### Documentation

- [x] Create roles/authorization overview (`docs/ROLES.md`)
- [ ] Update `docs/ROLES.md` to reflect RBAC model and final permission catalog
- [ ] Add admin guide for managing roles/permissions and expected effects

### DevOps / Operations

- [ ] Provide a safe runbook to apply `setup_rbac.sql` in production (backup/rollback plan)
- [ ] Add a script/endpoint to invalidate permissions cache when RBAC changes (if process-level caching is added)
- [ ] Add monitoring for 403 spikes to detect misconfigurations post-deploy

### Rollout Plan

- [x] Bridge mode: keep role in JWT; permission checks now active
- [ ] Staged rollout: enable new permission checks per route group, monitor, then remove legacy role arrays
- [ ] Post-rollout validation: confirm all staff flows work under permission gates only

### Acceptance Criteria

- [ ] No remaining hardcoded role-name arrays in route protection
- [ ] Admin can add/remove/rename/deactivate roles via API/UI
- [ ] Admin can enable/disable features via permission toggles per role
- [ ] Frontend conditionally shows features solely based on permissions
- [ ] Automated tests cover critical permission paths


