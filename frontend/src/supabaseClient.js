import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Helper functions for common operations
export const supabaseHelpers = {
  // Get current user
  getCurrentUser: () => supabase.auth.getUser(),
  
  // Get current session
  getCurrentSession: () => supabase.auth.getSession(),
  
  // Sign in with email/password
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signInWithPassword: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  
  // Sign out
  signOut: () => supabase.auth.signOut(),
  
  // Listen to auth changes
  onAuthStateChange: (callback) => supabase.auth.onAuthStateChange(callback),
  
  // Loads operations
  loads: {
    // Get loads created by current dispatcher - using user_loads view to prevent recursion
    getMyLoads: async () => {
      try {
        // Use the user_loads view which handles role-based filtering internally
        // This avoids triggering recursive policy evaluation
        return supabase
          .from('user_loads')
          .select('id, origin_address, destination_address, weight, dimensions, proposed_cost_by_user, delivery_distance_miles, created_by_dispatcher_id, created_at, updated_at')
          .order('created_at', { ascending: false });
      } catch (error) {
        console.error('Error in getMyLoads:', error);
        return { data: [], error };
      }
    },
      
    // Get loads with offer counts (avoids recursion)
    getMyLoadsWithOfferCounts: async () => {
      try {
        // Get user role first to determine query approach
        const { data: { user } } = await supabase.auth.getUser();
        const userRole = user?.user_metadata?.role || user?.raw_user_meta_data?.role || 'driver';
        console.log('Current user role:', userRole);
        
        // Use the user_loads view which handles role-based filtering internally
        // This avoids triggering recursive policy evaluation
        const { data: loads, error: loadsError } = await supabase
          .from('user_loads')
          .select('id, origin_address, destination_address, weight, dimensions, proposed_cost_by_user, delivery_distance_miles, created_by_dispatcher_id, created_at, updated_at')
          .order('created_at', { ascending: false });
        
        if (loadsError) {
          console.error('Error fetching loads:', loadsError);
          return { data: [], error: loadsError };
        }
        
        if (!loads || loads.length === 0) return { data: [] };
        
        // Then get all offers for these loads in a separate query
        const loadIds = loads.map(load => load.id);
        
        // If we have no load IDs, just return the loads without offers
        if (!loadIds.length) return { data: loads };
        
        // Use the get_user_load_offers function to safely get offers without triggering recursion
        // This function handles role-based filtering internally
        const { data: allOffers, error: offersError } = await supabase
          .rpc('get_user_load_offers', { p_load_ids: loadIds });
          
        if (offersError) {
          console.error('Error fetching offers:', offersError);
          // Still return loads even if offers query fails
          return { 
            data: loads.map(load => ({ ...load, load_offers: [] })),
            error: offersError 
          };
        }
        
        // Attach offers to their respective loads
        const loadsWithOffers = loads.map(load => ({
          ...load,
          load_offers: allOffers ? allOffers.filter(offer => offer.load_id === load.id) : []
        }));
        
        return { data: loadsWithOffers };
      } catch (error) {
        console.error('Unexpected error in getMyLoadsWithOfferCounts:', error);
        return { data: [], error };
      }
    },
    
    // Create new load using RPC function to avoid recursion
    create: async (loadData) => {
      // Get current user to extract role information
      const { data: { user } } = await supabase.auth.getUser();
      
      // Ensure role is set in the request
      const role = user?.user_metadata?.role || user?.app_metadata?.role || 'dispatcher';
      console.log('Creating load with role:', role);
      
      return supabase
        .rpc('create_user_load', {
          p_origin_address: loadData.origin_address,
          p_destination_address: loadData.destination_address,
          p_weight: loadData.weight || null,
          p_dimensions: loadData.dimensions || null,
          p_proposed_cost_by_user: loadData.proposed_cost_by_user || null,
          p_delivery_distance_miles: loadData.delivery_distance_miles || null,
          p_created_by_dispatcher_id: loadData.created_by_dispatcher_id
        })
        .single();
    },
  },
  
  // Load offers operations
  loadOffers: {
    // Get offers for specific load
    getByLoadId: (loadId) => supabase
      .from('load_offers')
      .select('*')
      .eq('load_id', loadId)
      .order('created_at', { ascending: false }),
    
    // Create multiple offers (batch insert) - now uses RPC to avoid RLS issues
    createBatch: async (offers) => {
      console.log('Creating batch offers with data:', offers);
      
      // Try RPC method first (preferred)
      try {
        // Group offers by load_id
        const offersByLoad = {};
        offers.forEach(offer => {
          if (!offersByLoad[offer.load_id]) {
            offersByLoad[offer.load_id] = [];
          }
          offersByLoad[offer.load_id].push(offer.mysql_truck_id);
        });
        
        // Create a promise for each load_id
        const promises = Object.entries(offersByLoad).map(([loadId, truckIds]) => {
          console.log(`Creating offers for load ${loadId} with truck IDs:`, truckIds);
          return supabase.rpc('create_load_offers_with_truck_ids', {
            p_load_id: parseInt(loadId),
            p_mysql_truck_ids: truckIds
          });
        });
        
        // Wait for all promises to resolve
        const results = await Promise.all(promises);
        console.log('RPC results:', results);
        return { data: offers, error: null };
      } catch (error) {
        console.error('RPC method failed, trying direct insert:', error);
        
        // Fallback to direct insert if RPC fails
        try {
          // Prepare offers with both mysql_truck_id and driver_user_id if available
          const preparedOffers = offers.map(offer => ({
            load_id: offer.load_id,
            mysql_truck_id: offer.mysql_truck_id,
            driver_user_id: offer.driver_user_id,
            offer_status: 'sent',
            created_at: new Date().toISOString()
          }));
          
          console.log('Trying direct insert with:', preparedOffers);
          const { data, error } = await supabase
            .from('load_offers')
            .insert(preparedOffers)
            .select();
            
          if (error) throw error;
          return { data, error: null };
        } catch (insertError) {
          console.error('Both RPC and direct insert failed:', insertError);
          return { data: null, error: insertError };
        }
      }
    },
    
    // Update offer status
    updateStatus: (offerId, status, additionalData = {}) => supabase
      .from('load_offers')
      .update({ 
        offer_status: status, 
        responded_at: new Date().toISOString(),
        ...additionalData 
      })
      .eq('id', offerId)
      .select()
      .single(),
  },
  
  // Messages operations
  messages: {
    // Get messages for specific offer
    getByOfferId: (offerId) => supabase
      .from('offer_messages')
      .select('*')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: true }),
    
    // Send message
    send: (messageData) => supabase
      .from('offer_messages')
      .insert([messageData])
      .select()
      .single(),
    
    // Mark messages as read
    markAsRead: (offerId, senderType = 'driver') => supabase
      .from('offer_messages')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq('offer_id', offerId)
      .eq('sender_type', senderType)
      .eq('is_read', false),
    
    // Get unread count for offer
    getUnreadCount: (offerId, excludeSenderType = 'dispatcher') => supabase
      .from('offer_messages')
      .select('id', { count: 'exact' })
      .eq('offer_id', offerId)
      .eq('is_read', false)
      .neq('sender_type', excludeSenderType),
  },
  
  // Realtime subscriptions
  realtime: {
    // Subscribe to load offers changes
    subscribeToLoadOffers: (callback) => supabase
      .channel('load_offers_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'load_offers' 
      }, callback)
      .subscribe(),
    
    // Subscribe to messages for specific offer
    subscribeToOfferMessages: (offerId, callback) => supabase
      .channel(`offer_messages_${offerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'offer_messages',
        filter: `offer_id=eq.${offerId}`
      }, callback)
      .subscribe(),
    
    // Subscribe to loads changes
    subscribeToLoads: (callback) => supabase
      .channel('loads_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'loads'
      }, callback)
      .subscribe(),
  }
};

export default supabase;
