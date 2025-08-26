const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://syndeneozjmgnpcfusfg.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmRlbmVvemptZ25wY2Z1c2ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTc4MTg5OSwiZXhwIjoyMDcxMzU3ODk5fQ.ThpeuyXHYzNOxagZ3R6LiLNO2mO7x3UE9pM6_umUJcs';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getSupabaseUsers() {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error('❌ Error getting users:', error.message);
      return;
    }
    
    console.log('📋 Current Supabase users:');
    console.log('==========================');
    
    data.users.forEach((user, index) => {
      const role = user.user_metadata?.role || 'no role';
      const username = user.user_metadata?.username || 'no username';
      const mysqlId = user.user_metadata?.mysql_id || 'no mysql_id';
      
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   Role: ${role}`);
      console.log(`   Username: ${username}`);
      console.log(`   MySQL ID: ${mysqlId}`);
      console.log(`   Supabase ID: ${user.id}`);
      console.log(`   Created: ${user.created_at}`);
      console.log('');
    });
    
    // Create mapping for migration script
    console.log('📝 For migration script update:');
    console.log('===============================');
    data.users.forEach(user => {
      const role = user.user_metadata?.role || 'dispatcher';
      console.log(`- ${user.email} (${role})`);
    });
    
    return data.users;
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

getSupabaseUsers();
