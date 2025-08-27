import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketProvider';
import OfferCardsCarousel from './OfferCardsCarousel';
import DriversListPanel from './DriversListPanel';
import ChatWindow from './ChatWindow';
import CreateOfferModal from './CreateOfferModal';
import { apiClient } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import './OffersPage.css';

const OffersPage = ({ onBack, user, trucks = [] }) => {
  const [offers, setOffers] = useState([]);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { 
    socket, 
    isConnected, 
    joinOfferChat, 
    leaveOfferChat,
    sendMessage,
    sendTypingStart,
    sendTypingStop
  } = useSocket();

  // Fetch offers on component mount
  useEffect(() => {
    fetchOffers();
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Listen for new offers
    socket.on('new_offer_created', handleNewOffer);
    
    // Listen for offer updates
    socket.on('offer_status_change', handleOfferStatusChange);
    
    // Listen for new driver proposals
    socket.on('driver_proposal', handleDriverProposal);

    return () => {
      socket.off('new_offer_created', handleNewOffer);
      socket.off('offer_status_change', handleOfferStatusChange);
      socket.off('driver_proposal', handleDriverProposal);
    };
  }, [socket, isConnected]);

  // Join/leave chat rooms when selection changes
  useEffect(() => {
    if (selectedOffer && selectedDriver) {
      joinOfferChat(selectedOffer.id, selectedDriver.id);
      
      return () => {
        leaveOfferChat(selectedOffer.id, selectedDriver.id);
      };
    }
  }, [selectedOffer, selectedDriver, joinOfferChat, leaveOfferChat]);

  const fetchOffers = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient(`${API_BASE_URL}/offers`);
      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }
      const data = await response.json();
      setOffers(data.offers || []);
      
      // Auto-select first active offer if none selected
      if (!selectedOffer && data.offers?.length > 0) {
        const activeOffer = data.offers.find(offer => offer.status === 'active') || data.offers[0];
        setSelectedOffer(activeOffer);
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch offers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewOffer = (offerData) => {
    setOffers(prev => [offerData, ...prev]);
  };

  const handleOfferStatusChange = (data) => {
    setOffers(prev => prev.map(offer => 
      offer.id === data.offerId 
        ? { ...offer, status: data.status }
        : offer
    ));
  };

  const handleDriverProposal = (data) => {
    // Update offer with new proposal
    setOffers(prev => prev.map(offer => {
      if (offer.id === data.offerId) {
        const updatedProposals = offer.proposals || [];
        const existingIndex = updatedProposals.findIndex(p => p.driver_id === data.driverId);
        
        if (existingIndex >= 0) {
          updatedProposals[existingIndex] = data.proposal;
        } else {
          updatedProposals.push(data.proposal);
        }
        
        return { ...offer, proposals: updatedProposals };
      }
      return offer;
    }));
  };

  const handleCreateOffer = async (offerData) => {
    try {
      const response = await apiClient(`${API_BASE_URL}/offers`, {
        method: 'POST',
        body: JSON.stringify({
          pickup_location: offerData.pickupLocation,
          pickup_lat: offerData.pickupLat,
          pickup_lon: offerData.pickupLon,
          delivery_location: offerData.deliveryLocation,
          delivery_lat: offerData.deliveryLat,
          delivery_lon: offerData.deliveryLon,
          weight_lbs: offerData.weight,
          dimensions: offerData.dimensions,
          distance_miles: offerData.distance,
          proposed_rate: offerData.proposedRate,
          pickup_date: offerData.pickupDate,
          pickup_time: offerData.pickupTime,
          notes: offerData.notes,
          selected_drivers: offerData.selectedDrivers
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create offer');
      }

      const result = await response.json();
      
      if (result.success) {
        setShowCreateModal(false);
        await fetchOffers(); // Refresh offers list
        
        // Auto-select the newly created offer
        if (result.offer) {
          setSelectedOffer(result.offer);
        }
      } else {
        throw new Error(result.message || 'Failed to create offer');
      }
    } catch (err) {
      console.error('Failed to create offer:', err);
      alert('Failed to create offer: ' + err.message);
    }
  };

  const handleOfferSelect = (offer) => {
    setSelectedOffer(offer);
    setSelectedDriver(null); // Clear driver selection when changing offers
  };

  const handleDriverSelect = (driver) => {
    setSelectedDriver(driver);
  };

  const handleSendMessage = (message, messageType = 'text') => {
    if (selectedOffer && selectedDriver) {
      sendMessage(selectedOffer.id, selectedDriver.id, message, messageType);
    }
  };

  const handleTypingStart = () => {
    if (selectedOffer && selectedDriver) {
      sendTypingStart(selectedOffer.id, selectedDriver.id);
    }
  };

  const handleTypingStop = () => {
    if (selectedOffer && selectedDriver) {
      sendTypingStop(selectedOffer.id, selectedDriver.id);
    }
  };

  const getOfferDrivers = (offer) => {
    if (!offer || !offer.proposals) return [];
    
    return offer.proposals.map(proposal => {
      const truck = trucks.find(t => t.id === proposal.driver_id);
      return {
        id: proposal.driver_id,
        name: truck?.driver_name || 'Unknown Driver',
        truckNumber: truck?.truck_no || 'N/A',
        phone: truck?.contactphone || truck?.cell_phone || 'N/A',
        location: truck?.city_state_zip || 'N/A',
        status: proposal.status,
        proposedRate: proposal.driver_proposed_rate,
        respondedAt: proposal.responded_at,
        isOnline: false // TODO: Get from socket presence
      };
    });
  };

  if (isLoading) {
    return (
      <div className="offers-page">
        <div className="offers-header">
          <button onClick={onBack} className="back-btn">← Back to Main</button>
          <h1>Offers Management</h1>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading offers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="offers-page">
        <div className="offers-header">
          <button onClick={onBack} className="back-btn">← Back to Main</button>
          <h1>Offers Management</h1>
        </div>
        <div className="error-state">
          <p>Error: {error}</p>
          <button onClick={fetchOffers} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-page">
      {/* Header */}
      <div className="offers-header">
        <div className="header-left">
          <button onClick={onBack} className="back-btn">← Back to Main</button>
          <h1>🚛 Active Offers</h1>
          <span className="connection-status">
            {isConnected ? (
              <span className="connected">🟢 Connected</span>
            ) : (
              <span className="disconnected">🔴 Disconnected</span>
            )}
          </span>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="create-offer-btn"
        >
          + New Offer
        </button>
      </div>

      {/* Offer Cards Carousel */}
      <div className="offers-carousel-section">
        <OfferCardsCarousel
          offers={offers}
          selectedOffer={selectedOffer}
          onOfferSelect={handleOfferSelect}
        />
      </div>

      {/* Main Content Area */}
      <div className="offers-main-content">
        {/* Left Panel: Offer Details + Drivers List */}
        <div className="left-panel">
          <DriversListPanel
            offer={selectedOffer}
            drivers={selectedOffer ? getOfferDrivers(selectedOffer) : []}
            selectedDriver={selectedDriver}
            onDriverSelect={handleDriverSelect}
          />
        </div>

        {/* Right Panel: Chat Interface */}
        <div className="right-panel">
          <ChatWindow
            offer={selectedOffer}
            driver={selectedDriver}
            socket={socket}
            isConnected={isConnected}
            onSendMessage={handleSendMessage}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
          />
        </div>
      </div>

      {/* Create Offer Modal */}
      <CreateOfferModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateOffer}
        selectedDrivers={[]} // Will be populated when called from TruckTable
        trucks={trucks}
      />
    </div>
  );
};

export default OffersPage;
