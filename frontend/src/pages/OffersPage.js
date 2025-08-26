import React, { useState, useEffect } from 'react';
import { supabaseHelpers } from '../supabaseClient';
import { useAuth } from '../context/HybridAuthContext';
import OffersList from '../components/offers/OffersList';
import OfferDriversList from '../components/offers/OfferDriversList';
import OfferChat from '../components/offers/OfferChat';
import './OffersPage.css';

const OffersPage = ({ onBack }) => {
  const { user, isAuthenticated } = useAuth();
  const [view, setView] = useState('offers'); // 'offers' | 'drivers'
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [loads, setLoads] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Realtime subscriptions
  const [loadsSubscription, setLoadsSubscription] = useState(null);
  const [offersSubscription, setOffersSubscription] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    fetchLoads();
    setupRealtimeSubscriptions();

    return () => {
      // Cleanup subscriptions
      if (loadsSubscription) {
        loadsSubscription.unsubscribe();
      }
      if (offersSubscription) {
        offersSubscription.unsubscribe();
      }
    };
  }, [isAuthenticated, user]);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      // Use the new method that avoids recursion
      const { data, error } = await supabaseHelpers.loads.getMyLoadsWithOfferCounts();
      
      if (error) {
        console.error('Error in getMyLoadsWithOfferCounts:', error);
        setError(error.message || 'Failed to load data. Please try again.');
        setLoads([]);
        return;
      }
      
      setLoads(data || []);
      // Clear any previous errors if successful
      setError(null);
    } catch (error) {
      console.error('Exception in fetchLoads:', error);
      setError(error.message || 'An unexpected error occurred');
      setLoads([]);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to loads changes
    const loadsSub = supabaseHelpers.realtime.subscribeToLoads((payload) => {
      console.log('Loads realtime event:', payload);
      
      if (payload.eventType === 'INSERT') {
        setLoads(prev => [payload.new, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setLoads(prev => prev.map(load => 
          load.id === payload.new.id ? payload.new : load
        ));
      } else if (payload.eventType === 'DELETE') {
        setLoads(prev => prev.filter(load => load.id !== payload.old.id));
      }
    });

    // Subscribe to load offers changes
    const offersSub = supabaseHelpers.realtime.subscribeToLoadOffers((payload) => {
      console.log('Load offers realtime event:', payload);
      
      // Update the offers in the selected load
      if (selectedLoad && payload.new?.load_id === selectedLoad.id) {
        if (payload.eventType === 'INSERT') {
          setOffers(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setOffers(prev => prev.map(offer => 
            offer.id === payload.new.id ? payload.new : offer
          ));
        } else if (payload.eventType === 'DELETE') {
          setOffers(prev => prev.filter(offer => offer.id !== payload.old.id));
        }
      }

      // Also update the load_offers count in loads list
      setLoads(prev => prev.map(load => {
        if (load.id === (payload.new?.load_id || payload.old?.load_id)) {
          const updatedLoad = { ...load };
          if (payload.eventType === 'INSERT') {
            updatedLoad.load_offers = [...(updatedLoad.load_offers || []), payload.new];
          } else if (payload.eventType === 'UPDATE') {
            updatedLoad.load_offers = (updatedLoad.load_offers || []).map(offer =>
              offer.id === payload.new.id ? payload.new : offer
            );
          } else if (payload.eventType === 'DELETE') {
            updatedLoad.load_offers = (updatedLoad.load_offers || []).filter(offer =>
              offer.id !== payload.old.id
            );
          }
          return updatedLoad;
        }
        return load;
      }));
    });

    setLoadsSubscription(loadsSub);
    setOffersSubscription(offersSub);
  };

  const handleLoadSelect = async (load) => {
    setSelectedLoad(load);
    setSelectedOffer(null);
    setView('drivers');
    
    // Fetch offers for this load
    try {
      const { data, error } = await supabaseHelpers.loadOffers.getByLoadId(load.id);
      if (error) throw error;
      setOffers(data || []);
    } catch (error) {
      console.error('Error fetching offers:', error);
      setError(error.message);
    }
  };

  const handleOfferSelect = (offer) => {
    setSelectedOffer(offer);
  };

  const handleBackToOffers = () => {
    setView('offers');
    setSelectedLoad(null);
    setSelectedOffer(null);
    setOffers([]);
  };

  const handleOfferStatusUpdate = (offerId, newStatus, additionalData = {}) => {
    // Optimistically update the UI
    setOffers(prev => prev.map(offer => 
      offer.id === offerId 
        ? { ...offer, offer_status: newStatus, ...additionalData }
        : offer
    ));
  };

  if (!isAuthenticated) {
    return (
      <div className="offers-page">
        <div className="page-header">
          <div className="driver-updates-header-left">
            <h2>Offers</h2>
          </div>
          <div className="driver-updates-header-controls">
            <button onClick={onBack} className="back-btn">← Back to Main</button>
          </div>
        </div>
        <div className="auth-required">
          <p>Please sign in with Supabase to view offers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-page">
      <div className="page-header">
        <div className="driver-updates-header-left">
          <h2>Load Offers</h2>
        </div>
        <div className="driver-updates-header-controls">
          <button onClick={onBack} className="back-btn">← Back to Main</button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="offers-content">
        <div className="left-panel">
          {view === 'offers' ? (
            <OffersList 
              loads={loads}
              loading={loading}
              onLoadSelect={handleLoadSelect}
              onRefresh={fetchLoads}
            />
          ) : (
            <OfferDriversList
              load={selectedLoad}
              offers={offers}
              onBack={handleBackToOffers}
              onOfferSelect={handleOfferSelect}
              selectedOfferId={selectedOffer?.id}
            />
          )}
        </div>

        <div className="right-panel">
          {selectedOffer ? (
            <OfferChat
              offer={selectedOffer}
              load={selectedLoad}
              onStatusUpdate={handleOfferStatusUpdate}
            />
          ) : (
            <div className="no-chat-selected">
              <div className="placeholder-content">
                <h3>Select a driver to start chatting</h3>
                <p>Choose a driver from the list to view offer details and send messages.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OffersPage;
