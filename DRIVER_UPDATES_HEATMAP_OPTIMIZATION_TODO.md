# Driver Updates Heatmap Optimization TODO

## Overview
This document outlines optimization opportunities for the Driver Updates heatmap system to improve loading performance and reduce database load.

## Current Performance Issues

### 1. Multiple Database Calls for App Timezone
- **Problem**: `SettingsService::getActiveTimezone()` is called 3-4 times per request
- **Impact**: Each call makes a separate SQL query to the `settings` table
- **Location**: `api/src/Core/SettingsService.php:35-61`

### 2. Inefficient Activity Logs Processing
- **Problem**: Loads all activity logs for entire month into memory
- **Impact**: Parses JSON `details` for each record and converts timezones
- **Location**: `api/src/Controllers/DriverUpdatesController.php:603-646`

### 3. Data Generation Overhead
- **Problem**: Creates array for each day of month and processes each truck separately
- **Impact**: Memory usage and processing time increases with data volume
- **Location**: `api/src/Controllers/DriverUpdatesController.php:656-685`

## Optimization Opportunities

### High Priority

#### 1. App Timezone Caching
**File**: `api/src/Core/SettingsService.php`
```php
// Add static caching variable
private static $cachedTimezone = null;

public static function getActiveTimezone(): string
{
    if (self::$cachedTimezone !== null) {
        return self::$cachedTimezone;
    }
    
    // ... existing code ...
    self::$cachedTimezone = $tz;
    return $tz;
}
```
**Expected Impact**: 20-30% faster execution

#### 2. SQL Query Optimization
**File**: `api/src/Controllers/DriverUpdatesController.php`
```sql
-- Add database indexes
CREATE INDEX idx_activity_logs_action_date ON activity_logs(action, DATE(created_at));
CREATE INDEX idx_activity_logs_truck_updated ON activity_logs(action, created_at) WHERE action = 'truck_updated';

-- Use aggregation instead of PHP processing
SELECT 
    JSON_EXTRACT(details, '$.truck_id') as truck_id,
    DATE(created_at) as date,
    COUNT(*) as updates
FROM activity_logs 
WHERE action = 'truck_updated' 
    AND DATE(created_at) BETWEEN :start_date AND :end_date
GROUP BY truck_id, DATE(created_at)
```
**Expected Impact**: 40-60% faster execution

#### 3. Lazy Loading Implementation
**File**: `frontend/src/components/DriverUpdates.js`
```javascript
// Load heatmap only when tab is activated
useEffect(() => {
    if (activeTab === 'heatmap' && !heatmapData) {
        loadHeatmapData();
    }
}, [activeTab, heatmapData]);
```
**Expected Impact**: 50-70% faster initial page load

### Medium Priority

#### 4. Pagination/Virtualization
**File**: `api/src/Controllers/DriverUpdatesController.php`
```php
// Add pagination parameters
$limit = $_GET['limit'] ?? 50;
$offset = $_GET['offset'] ?? 0;

// Modify SQL query
$sql .= " LIMIT :limit OFFSET :offset";
```
**Expected Impact**: Reduced memory usage and faster response

#### 5. API Response Caching
**File**: `api/src/Controllers/DriverUpdatesController.php`
```php
// Add cache headers
header('Cache-Control: public, max-age=900'); // 15 minutes
header('ETag: "' . md5($cacheKey) . '"');

// Check ETag before processing
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && $_SERVER['HTTP_IF_NONE_MATCH'] === $etag) {
    http_response_code(304);
    exit();
}
```
**Expected Impact**: Reduced server load for repeated requests

### Low Priority

#### 6. Frontend State Management
**File**: `frontend/src/components/DriverUpdates.js`
```javascript
// Add loading states and error boundaries
const [heatmapLoading, setHeatmapLoading] = useState(false);
const [heatmapError, setHeatmapError] = useState(null);

// Implement retry mechanism
const retryLoadHeatmap = () => {
    setHeatmapError(null);
    loadHeatmapData();
};
```
**Expected Impact**: Better user experience

#### 7. Data Compression
**File**: `api/src/Controllers/DriverUpdatesController.php`
```php
// Compress large responses
if (strlen($response) > 1024) {
    header('Content-Encoding: gzip');
    echo gzencode($response);
} else {
    echo $response;
}
```
**Expected Impact**: Reduced bandwidth usage

## Implementation Steps

### Phase 1: Quick Wins (1-2 days)
1. Implement App timezone caching
2. Add database indexes
3. Implement lazy loading

### Phase 2: Core Optimizations (3-5 days)
1. Refactor SQL queries with aggregation
2. Implement pagination
3. Add response caching

### Phase 3: Advanced Features (1-2 weeks)
1. Implement virtual scrolling
2. Add real-time updates
3. Optimize frontend rendering

## Database Schema Changes

### Required Indexes
```sql
-- Activity logs optimization
CREATE INDEX idx_activity_logs_action_date ON activity_logs(action, DATE(created_at));
CREATE INDEX idx_activity_logs_truck_updated ON activity_logs(action, created_at) WHERE action = 'truck_updated';

-- Settings table optimization
CREATE INDEX idx_settings_key ON settings(`key`);
```

### Optional Performance Indexes
```sql
-- Truck filtering optimization
CREATE INDEX idx_trucks_dispatcher ON trucks(assigned_dispatcher_id);
CREATE INDEX idx_trucks_updated ON trucks(updated_at);
```

## Monitoring and Metrics

### Key Performance Indicators
- **Response Time**: Target < 500ms for heatmap data
- **Database Queries**: Target < 5 queries per request
- **Memory Usage**: Target < 50MB per request
- **Cache Hit Rate**: Target > 80%

### Logging Requirements
```php
// Add performance logging
Logger::info('Heatmap performance metrics', [
    'execution_time' => microtime(true) - $startTime,
    'memory_usage' => memory_get_peak_usage(true),
    'query_count' => $queryCount,
    'cache_hits' => $cacheHits
]);
```

## Testing Strategy

### Performance Testing
1. **Load Testing**: Simulate 100+ concurrent users
2. **Stress Testing**: Test with large datasets (1000+ trucks)
3. **Memory Testing**: Monitor memory usage patterns

### Functional Testing
1. **Timezone Handling**: Test with different App timezones
2. **Data Accuracy**: Verify heatmap data matches activity logs
3. **Edge Cases**: Test with missing or malformed data

## Rollout Plan

### Staging Environment
1. Deploy optimizations to staging
2. Run performance tests
3. Validate data accuracy
4. Get stakeholder approval

### Production Deployment
1. Deploy during low-traffic period
2. Monitor performance metrics
3. Rollback plan if issues arise
4. Gradual rollout to user groups

## Success Criteria

### Performance Targets
- **Heatmap Load Time**: < 2 seconds (currently 5-10 seconds)
- **Database Load**: < 30% of current usage
- **Memory Usage**: < 100MB per request
- **User Experience**: Smooth scrolling and interaction

### Business Impact
- **User Satisfaction**: Reduced complaints about slow loading
- **System Reliability**: Fewer timeouts and errors
- **Scalability**: Support for 2x current user base
- **Maintenance**: Reduced server costs and complexity

## Future Considerations

### Long-term Optimizations
1. **Real-time Updates**: WebSocket implementation for live data
2. **Advanced Caching**: Redis implementation for distributed caching
3. **Data Archiving**: Move old activity logs to archive tables
4. **CDN Integration**: Serve static heatmap assets via CDN

### Technology Upgrades
1. **PHP 8.1+**: Leverage new performance features
2. **Database Optimization**: Consider read replicas for analytics
3. **Frontend Framework**: Evaluate React optimization libraries

## Notes

- All optimizations should maintain backward compatibility
- Performance improvements should not compromise data accuracy
- Consider implementing feature flags for gradual rollout
- Monitor system resources during optimization implementation
- Document all changes for future maintenance

---

**Last Updated**: [Current Date]
**Priority**: High
**Estimated Effort**: 2-3 weeks
**Assigned To**: [Developer Name]
**Review By**: [Tech Lead/Manager]
