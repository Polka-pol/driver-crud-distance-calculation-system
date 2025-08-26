const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://syndeneozjmgnpcfusfg.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmRlbmVvemptZ25wY2Z1c2ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTc4MTg5OSwiZXhwIjoyMDcxMzU3ODk5fQ.ThpeuyXHYzNOxagZ3R6LiLNO2mO7x3UE9pM6_umUJcs';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testKey() {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error('❌ Key invalid:', error.message);
    } else {
      console.log('✅ Key valid! Found', data.users.length, 'users');
      data.users.forEach(user => {
        console.log(`- ${user.email} (${user.user_metadata?.role || 'no role'})`);
      });
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

testKey();
