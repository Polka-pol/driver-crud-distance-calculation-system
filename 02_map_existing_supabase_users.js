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

async function mapExistingUsers() {
    let connection;
    
    try {
        // Connect to MySQL
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MySQL database');
        
        // Get existing Supabase users
        const { data: supabaseUsers, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;
        
        console.log(`\n📋 Found ${supabaseUsers.users.length} users in Supabase`);
        
        // Get MySQL users
        const [mysqlUsers] = await connection.execute(`
            SELECT id, username, email, full_name, mobile_number, role 
            FROM users 
            ORDER BY id
        `);
        
        console.log(`📋 Found ${mysqlUsers.length} users in MySQL`);
        
        // Create mapping based on username matching
        const mappingResults = [];
        
        for (const mysqlUser of mysqlUsers) {
            console.log(`\n🔍 Looking for MySQL user: ${mysqlUser.username} (${mysqlUser.email})`);
            
            // Find matching Supabase user by username
            const supabaseUser = supabaseUsers.users.find(su => 
                su.user_metadata?.username === mysqlUser.username
            );
            
            if (supabaseUser) {
                console.log(`✅ Found match: ${supabaseUser.email} (${supabaseUser.id})`);
                
                // Update MySQL user with Supabase ID
                await connection.execute(
                    'UPDATE users SET supabase_user_id = ? WHERE id = ?',
                    [supabaseUser.id, mysqlUser.id]
                );
                
                // Update Supabase user metadata with MySQL ID
                const { error: updateError } = await supabase.auth.admin.updateUserById(
                    supabaseUser.id,
                    {
                        user_metadata: {
                            ...supabaseUser.user_metadata,
                            mysql_id: mysqlUser.id,
                            mapped_at: new Date().toISOString()
                        }
                    }
                );
                
                if (updateError) {
                    console.error(`❌ Failed to update Supabase metadata:`, updateError.message);
                } else {
                    console.log(`✅ Updated Supabase metadata with MySQL ID`);
                }
                
                mappingResults.push({
                    mysql_id: mysqlUser.id,
                    mysql_username: mysqlUser.username,
                    mysql_email: mysqlUser.email,
                    supabase_id: supabaseUser.id,
                    supabase_email: supabaseUser.email,
                    status: 'mapped'
                });
                
            } else {
                console.log(`❌ No matching Supabase user found for ${mysqlUser.username}`);
                mappingResults.push({
                    mysql_id: mysqlUser.id,
                    mysql_username: mysqlUser.username,
                    mysql_email: mysqlUser.email,
                    status: 'not_found'
                });
            }
        }
        
        // Display mapping summary
        console.log('\n📊 MAPPING SUMMARY:');
        console.log('===================');
        
        const mapped = mappingResults.filter(r => r.status === 'mapped');
        const notFound = mappingResults.filter(r => r.status === 'not_found');
        
        console.log(`✅ Successfully mapped: ${mapped.length}`);
        console.log(`❌ Not found in Supabase: ${notFound.length}`);
        
        if (mapped.length > 0) {
            console.log('\n🔗 SUCCESSFUL MAPPINGS:');
            console.log('=======================');
            mapped.forEach(user => {
                console.log(`MySQL ID ${user.mysql_id} (${user.mysql_username}) → Supabase ID ${user.supabase_id} (${user.supabase_email})`);
            });
        }
        
        if (notFound.length > 0) {
            console.log('\n❌ USERS NOT FOUND IN SUPABASE:');
            console.log('===============================');
            notFound.forEach(user => {
                console.log(`${user.mysql_username} (${user.mysql_email}) - MySQL ID: ${user.mysql_id}`);
            });
        }
        
        // Verify final mapping
        console.log('\n🔍 FINAL VERIFICATION:');
        console.log('======================');
        const [finalMapping] = await connection.execute(`
            SELECT id, username, email, supabase_user_id 
            FROM users 
            ORDER BY id
        `);
        
        finalMapping.forEach(user => {
            if (user.supabase_user_id) {
                console.log(`✅ ${user.username} → ${user.supabase_user_id}`);
            } else {
                console.log(`❌ ${user.username} → NOT MAPPED`);
            }
        });
        
        return mappingResults;
        
    } catch (error) {
        console.error('❌ Mapping failed:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n📤 MySQL connection closed');
        }
    }
}

// Run mapping
if (require.main === module) {
    mapExistingUsers()
        .then((results) => {
            console.log('\n🎉 User mapping completed!');
            console.log('Next step: Run 03_update_historical_data.sql');
        })
        .catch((error) => {
            console.error('💥 Mapping failed:', error);
            process.exit(1);
        });
}

module.exports = { mapExistingUsers };
