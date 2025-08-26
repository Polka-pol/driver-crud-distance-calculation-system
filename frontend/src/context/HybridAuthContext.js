import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseHelpers } from '../supabaseClient';

const HybridAuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(HybridAuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a HybridAuthProvider');
  }
  return context;
};

export const HybridAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabaseHelpers.getCurrentSession();
        if (error) throw error;
        
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Error getting initial session:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabaseHelpers.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event, session?.user?.email);
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (event === 'SIGNED_OUT') {
          setError(null);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Supabase email-only sign in method
  const signIn = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      // Validate email format
      if (!email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }

      const { data, error } = await supabaseHelpers.signInWithPassword(email, password);
      
      if (error) {
        throw new Error('Invalid credentials. Please check your email and password.');
      }
      
      return { data, error: null };

    } catch (error) {
      console.error('Sign in error:', error);
      setError(error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { error } = await supabaseHelpers.signOut();
      
      if (error) throw error;
      
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      setError(error.message);
      return { error };
    } finally {
      setLoading(false);
    }
  };


  const value = {
    user,
    session,
    loading,
    error,
    signIn,
    signOut,
    isAuthenticated: !!user,
    isDispatcher: user?.user_metadata?.role === 'dispatcher' || 
                  user?.app_metadata?.role === 'dispatcher',
    userRole: user?.user_metadata?.role || user?.app_metadata?.role || 'dispatcher'
  };

  return (
    <HybridAuthContext.Provider value={value}>
      {children}
    </HybridAuthContext.Provider>
  );
};
