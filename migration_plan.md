# Complete Supabase Migration Plan

## Current Database State
- **5 users total** (3 dispatchers, 2 admins)
- **14,625 activity logs** to migrate
- **All emails unique** ✅
- **supabase_user_id column already exists** ✅

## Migration Strategy

### Phase 1: Prepare Database (5 minutes)
```sql
-- Add supabase_user_id to tables that need it
ALTER TABLE activity_logs ADD COLUMN supabase_user_id VARCHAR(36) NULL AFTER user_id;
ALTER TABLE distance_log ADD COLUMN supabase_user_id VARCHAR(36) NULL AFTER user_id;
ALTER TABLE truck_location_history ADD COLUMN supabase_changed_by_id VARCHAR(36) NULL AFTER changed_by_user_id;
ALTER TABLE user_roles ADD COLUMN supabase_user_id VARCHAR(36) NULL AFTER user_id;

-- Add indexes for performance
CREATE INDEX idx_activity_logs_supabase_user_id ON activity_logs(supabase_user_id);
CREATE INDEX idx_distance_log_supabase_user_id ON distance_log(supabase_user_id);
CREATE INDEX idx_truck_history_supabase_user_id ON truck_location_history(supabase_changed_by_id);
```

### Phase 2: Migrate Users to Supabase (10 minutes)
For each user:
1. Create in Supabase Auth with temporary password
2. Update users.supabase_user_id with new UUID
3. Store mapping for log updates

**Users already in Supabase (need MySQL mapping):**
- jacob@shipconnex.com (dispatcher)
- michael@connexlogistics.com (admin)
- leo@shipconnex.com (dispatcher)
- carl@shipconnex.com (dispatcher)
- vlad.polishuk.biz@gmail.com (admin)

### Phase 3: Update Historical Data (5 minutes)
```sql
-- Update activity_logs
UPDATE activity_logs al 
JOIN users u ON al.user_id = u.id 
SET al.supabase_user_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Update distance_log
UPDATE distance_log dl 
JOIN users u ON dl.user_id = u.id 
SET dl.supabase_user_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Update truck_location_history
UPDATE truck_location_history tlh 
JOIN users u ON tlh.changed_by_user_id = u.id 
SET tlh.supabase_changed_by_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Update user_roles
UPDATE user_roles ur 
JOIN users u ON ur.user_id = u.id 
SET ur.supabase_user_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;
```

### Phase 4: Update Application Code (15 minutes)
1. Modify ActivityLogger to use supabase_user_id
2. Update all user display logic
3. Remove MySQL auth dependencies
4. Test with migrated users

### Phase 5: Cleanup (5 minutes)
After successful testing:
```sql
-- Make supabase_user_id NOT NULL (optional)
-- ALTER TABLE activity_logs MODIFY supabase_user_id VARCHAR(36) NOT NULL;
-- ALTER TABLE distance_log MODIFY supabase_user_id VARCHAR(36) NOT NULL;

-- Drop old user_id columns (after thorough testing)
-- ALTER TABLE activity_logs DROP COLUMN user_id;
-- ALTER TABLE distance_log DROP COLUMN user_id;
```

## Risk Mitigation
- ✅ Database backup completed
- Keep old user_id columns during transition
- Test each phase before proceeding
- Rollback plan: restore from backup

## Success Criteria
- All 5 users can login with Supabase
- All 14,625 activity logs accessible
- New logs use supabase_user_id
- No data loss
- Clean architecture (single auth system)

## Estimated Total Time: 40 minutes
