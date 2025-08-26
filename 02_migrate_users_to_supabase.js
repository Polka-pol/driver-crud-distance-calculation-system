const { createClient } = require('@supabase/supabase-js');
const mysql = require('mysql2/promise');

// Configuration
const supabaseUrl = 'https://syndeneozjmgnpcfusfg.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmRlbmVvemptZ25wY2Z1c2ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTc4MTg5OSwiZXhwIjoyMDcxMzU3ODk5fQ.ThpeuyXHYzNOxagZ3R6LiLNO2mO7x3UE9pM6_umUJcs';

const dbConfig = {
    host: 'dr542239.mysql.tools',
    port: 3306,
    user: 'dr542239_db',
    password: '4WYhhUgU',
    database: 'dr542239_db'
};

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function migrateUsers() {
    let connection;
    
    try {
        // Connect to MySQL
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MySQL database');
        
        // Get all users from MySQL
        const [users] = await connection.execute(`
            SELECT id, username, email, full_name, mobile_number, role, created_at 
            FROM users 
            ORDER BY id
        `);
        
        console.log(`\n📋 Found ${users.length} users to migrate:`);
        
        const migrationResults = [];
        
        for (const user of users) {
            console.log(`\n🔄 Migrating user: ${user.email} (${user.username})`);
            
            try {
                // Generate temporary password
                const tempPassword = `Temp${user.id}${Math.random().toString(36).substring(2, 8)}!`;
                
                // Create user in Supabase
                const { data: supabaseUser, error } = await supabase.auth.admin.createUser({
                    email: user.email,
                    password: tempPassword,
                    email_confirm: true,
                    user_metadata: {
                        username: user.username,
                        full_name: user.full_name,
                        mobile_number: user.mobile_number,
                        role: user.role,
                        mysql_id: user.id,
                        migrated_at: new Date().toISOString(),
                        temp_password: tempPassword // Store for user notification
                    }
                });
                
                if (error) {
                    throw error;
                }
                
                console.log(`✅ Created Supabase user: ${supabaseUser.user.id}`);
                
                // Update MySQL users table with Supabase UUID
                await connection.execute(
                    'UPDATE users SET supabase_user_id = ? WHERE id = ?',
                    [supabaseUser.user.id, user.id]
                );
                
                console.log(`✅ Updated MySQL record with Supabase ID`);
                
                migrationResults.push({
                    mysql_id: user.id,
                    supabase_id: supabaseUser.user.id,
                    email: user.email,
                    username: user.username,
                    temp_password: tempPassword,
                    status: 'success'
                });
                
            } catch (userError) {
                console.error(`❌ Failed to migrate ${user.email}:`, userError.message);
                migrationResults.push({
                    mysql_id: user.id,
                    email: user.email,
                    username: user.username,
                    status: 'failed',
                    error: userError.message
                });
            }
        }
        
        // Display migration summary
        console.log('\n📊 MIGRATION SUMMARY:');
        console.log('=====================');
        
        const successful = migrationResults.filter(r => r.status === 'success');
        const failed = migrationResults.filter(r => r.status === 'failed');
        
        console.log(`✅ Successfully migrated: ${successful.length}`);
        console.log(`❌ Failed migrations: ${failed.length}`);
        
        if (successful.length > 0) {
            console.log('\n🔑 TEMPORARY PASSWORDS (share with users):');
            console.log('==========================================');
            successful.forEach(user => {
                console.log(`${user.email} (${user.username}): ${user.temp_password}`);
            });
        }
        
        if (failed.length > 0) {
            console.log('\n❌ FAILED MIGRATIONS:');
            console.log('====================');
            failed.forEach(user => {
                console.log(`${user.email}: ${user.error}`);
            });
        }
        
        // Verify mapping
        console.log('\n🔍 VERIFICATION - User Mapping:');
        console.log('===============================');
        const [mappedUsers] = await connection.execute(`
            SELECT id, username, email, supabase_user_id 
            FROM users 
            WHERE supabase_user_id IS NOT NULL
            ORDER BY id
        `);
        
        mappedUsers.forEach(user => {
            console.log(`MySQL ID ${user.id} → Supabase ID ${user.supabase_user_id} (${user.email})`);
        });
        
        return migrationResults;
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n📤 MySQL connection closed');
        }
    }
}

// Run migration
if (require.main === module) {
    migrateUsers()
        .then((results) => {
            console.log('\n🎉 User migration completed!');
            console.log('Next step: Run 03_update_historical_data.sql');
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateUsers };
