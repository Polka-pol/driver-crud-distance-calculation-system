const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'dr542239.mysql.tools',
    port: 3306,
    user: 'dr542239_db',
    password: '4WYhhUgU',
    database: 'dr542239_db'
};

async function updateHistoricalData() {
    let connection;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MySQL database');
        
        // 1. Update activity_logs
        console.log('\n🔄 Updating activity_logs...');
        const [activityResult] = await connection.execute(`
            UPDATE activity_logs al 
            JOIN users u ON al.user_id = u.id 
            SET al.supabase_user_id = u.supabase_user_id 
            WHERE u.supabase_user_id IS NOT NULL
        `);
        console.log(`✅ Updated ${activityResult.affectedRows} activity_logs records`);
        
        // Verify activity_logs
        const [activityCheck] = await connection.execute(`
            SELECT 
                COUNT(*) as total_logs,
                COUNT(supabase_user_id) as updated_logs,
                COUNT(*) - COUNT(supabase_user_id) as remaining_logs
            FROM activity_logs
        `);
        console.log(`📊 Activity logs: ${activityCheck[0].total_logs} total, ${activityCheck[0].updated_logs} updated, ${activityCheck[0].remaining_logs} remaining`);
        
        // 2. Update distance_log
        console.log('\n🔄 Updating distance_log...');
        const [distanceResult] = await connection.execute(`
            UPDATE distance_log dl 
            JOIN users u ON dl.user_id = u.id 
            SET dl.supabase_user_id = u.supabase_user_id 
            WHERE u.supabase_user_id IS NOT NULL
        `);
        console.log(`✅ Updated ${distanceResult.affectedRows} distance_log records`);
        
        // Verify distance_log
        const [distanceCheck] = await connection.execute(`
            SELECT 
                COUNT(*) as total_logs,
                COUNT(supabase_user_id) as updated_logs,
                COUNT(*) - COUNT(supabase_user_id) as remaining_logs
            FROM distance_log
        `);
        console.log(`📊 Distance logs: ${distanceCheck[0].total_logs} total, ${distanceCheck[0].updated_logs} updated, ${distanceCheck[0].remaining_logs} remaining`);
        
        // 3. Update truck_location_history
        console.log('\n🔄 Updating truck_location_history...');
        const [truckResult] = await connection.execute(`
            UPDATE truck_location_history tlh 
            JOIN users u ON tlh.changed_by_user_id = u.id 
            SET tlh.supabase_changed_by_id = u.supabase_user_id 
            WHERE u.supabase_user_id IS NOT NULL
        `);
        console.log(`✅ Updated ${truckResult.affectedRows} truck_location_history records`);
        
        // Verify truck_location_history
        const [truckCheck] = await connection.execute(`
            SELECT 
                COUNT(*) as total_records,
                COUNT(supabase_changed_by_id) as updated_records,
                COUNT(*) - COUNT(supabase_changed_by_id) as remaining_records
            FROM truck_location_history
        `);
        console.log(`📊 Truck history: ${truckCheck[0].total_records} total, ${truckCheck[0].updated_records} updated, ${truckCheck[0].remaining_records} remaining`);
        
        // 4. Update user_roles
        console.log('\n🔄 Updating user_roles...');
        const [rolesResult] = await connection.execute(`
            UPDATE user_roles ur 
            JOIN users u ON ur.user_id = u.id 
            SET ur.supabase_user_id = u.supabase_user_id 
            WHERE u.supabase_user_id IS NOT NULL
        `);
        console.log(`✅ Updated ${rolesResult.affectedRows} user_roles records`);
        
        // Verify user_roles
        const [rolesCheck] = await connection.execute(`
            SELECT 
                COUNT(*) as total_roles,
                COUNT(supabase_user_id) as updated_roles,
                COUNT(*) - COUNT(supabase_user_id) as remaining_roles
            FROM user_roles
        `);
        console.log(`📊 User roles: ${rolesCheck[0].total_roles} total, ${rolesCheck[0].updated_roles} updated, ${rolesCheck[0].remaining_roles} remaining`);
        
        // 5. Show sample records
        console.log('\n📋 Sample updated records:');
        console.log('==========================');
        
        const [samples] = await connection.execute(`
            SELECT 'activity_logs' as table_name, user_id, supabase_user_id, action, created_at
            FROM activity_logs 
            WHERE supabase_user_id IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 3
        `);
        
        samples.forEach(record => {
            console.log(`${record.table_name}: MySQL ID ${record.user_id} → Supabase ID ${record.supabase_user_id.substring(0, 8)}... (${record.action})`);
        });
        
        // 6. Migration summary
        console.log('\n📊 FINAL MIGRATION SUMMARY:');
        console.log('===========================');
        
        const [summary] = await connection.execute(`
            SELECT 
                u.id as mysql_id,
                u.username,
                u.email,
                u.supabase_user_id,
                (SELECT COUNT(*) FROM activity_logs WHERE supabase_user_id = u.supabase_user_id) as activity_logs,
                (SELECT COUNT(*) FROM distance_log WHERE supabase_user_id = u.supabase_user_id) as distance_logs,
                (SELECT COUNT(*) FROM truck_location_history WHERE supabase_changed_by_id = u.supabase_user_id) as location_history,
                (SELECT COUNT(*) FROM user_roles WHERE supabase_user_id = u.supabase_user_id) as roles
            FROM users u
            WHERE u.supabase_user_id IS NOT NULL
            ORDER BY u.id
        `);
        
        summary.forEach(user => {
            console.log(`${user.username} (MySQL ID ${user.mysql_id}):`);
            console.log(`  - Activity logs: ${user.activity_logs}`);
            console.log(`  - Distance logs: ${user.distance_logs}`);
            console.log(`  - Location history: ${user.location_history}`);
            console.log(`  - User roles: ${user.roles}`);
            console.log('');
        });
        
        console.log('🎉 Historical data migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Historical data update failed:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('📤 MySQL connection closed');
        }
    }
}

// Run update
if (require.main === module) {
    updateHistoricalData()
        .then(() => {
            console.log('\n✅ All historical data updated!');
            console.log('🚀 Migration Phase 3 completed successfully!');
            console.log('Next: Update application code to use Supabase IDs');
        })
        .catch((error) => {
            console.error('💥 Update failed:', error);
            process.exit(1);
        });
}

module.exports = { updateHistoricalData };
