import React, { useState, useEffect, useRef } from 'react';
import OffersCarousel from './OffersCarousel';
import OfferDetailsPanel from './OfferDetailsPanel';
import DriversListPanel from './DriversListPanel';
import ChatWindow from './ChatWindow';
import { useSocket } from '../context/SocketProvider';
import offersApi from '../services/offersApi';
import './OffersPage.css';

const OffersPage = ({ onBack, user }) => {
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  const { socket, isConnected, emit, joinRoom, leaveRoom, connect } = useSocket();
  const prevOfferIdRef = useRef(null);
  const prevDriverIdRef = useRef(null);
  
  // Debug: Log connection status
  useEffect(() => {
    console.log('Socket connection status:', { isConnected, socket: !!socket });
  }, [isConnected, socket]);
  // Ensure socket connects on mount
  useEffect(() => {
    if (!isConnected) {
      try { connect(); } catch (e) { /* noop */ }
    }
    // no cleanup
  }, []);

  // Load offers from API
  useEffect(() => {
    const loadOffers = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await offersApi.getOffers();
        if (response.success) {
          setOffers(response.offers || []);
        } else {
          setError(response.message || 'Failed to load offers');
        }
      } catch (err) {
        console.error('Error loading offers:', err);
        setError(err.message || 'Failed to load offers');
      } finally {
        setIsLoading(false);
      }
    };

    loadOffers();
  }, []);

  // Load drivers when offer is selected
  useEffect(() => {
    const loadDriversForOffer = async () => {
      if (selectedOfferId) {
        try {
          // First try to load proposals for this offer
          const proposalsResponse = await offersApi.getOfferProposals(selectedOfferId);
          if (proposalsResponse.success && Array.isArray(proposalsResponse.proposals) && proposalsResponse.proposals.length > 0) {
            // Transform proposals into driver format
            const driversData = proposalsResponse.proposals.map(proposal => ({
              id: proposal.driver_id,
              DriverName: proposal.driver_name || `Driver ${proposal.driver_id}`,
              TruckNumber: proposal.truck_number || 'N/A',
              CellPhone: proposal.driver_phone || 'N/A',
              city_state_zip: proposal.driver_location || 'N/A',
              dimensions_payload: proposal.truck_dimensions || 'N/A',
              offerStatus: proposal.status || 'sent',
              isOnline: false, // Will be updated by Socket.io presence
              proposalId: proposal.id,
              proposedRate: proposal.proposed_rate,
              message: proposal.message
            }));
            setDrivers(driversData);
            return;
          }

          // Fallback: use invited_driver_ids from the selected offer to show initial list
          const offer = offers.find(o => o.id === selectedOfferId);
          const invitedIds = Array.isArray(offer?.invited_driver_ids) ? offer.invited_driver_ids : [];
          if (invitedIds.length > 0) {
            try {
              // Fetch real driver details by IDs
              const driversResponse = await offersApi.getDriversByIds(invitedIds);
              if (driversResponse.success && Array.isArray(driversResponse.drivers)) {
                setDrivers(driversResponse.drivers);
              } else {
                // Fallback to stub drivers if API fails
                const stubDrivers = invitedIds.map(id => ({
                  id,
                  DriverName: `Driver ${id}`,
                  TruckNumber: 'N/A',
                  CellPhone: 'N/A',
                  city_state_zip: 'N/A',
                  dimensions_payload: 'N/A',
                  offerStatus: 'not_sent',
                  isOnline: false
                }));
                setDrivers(stubDrivers);
              }
            } catch (error) {
              console.error('Error fetching driver details:', error);
              // Fallback to stub drivers if API fails
              const stubDrivers = invitedIds.map(id => ({
                id,
                DriverName: `Driver ${id}`,
                TruckNumber: 'N/A',
                CellPhone: 'N/A',
                city_state_zip: 'N/A',
                dimensions_payload: 'N/A',
                offerStatus: 'not_sent',
                isOnline: false
              }));
              setDrivers(stubDrivers);
            }
          } else {
            setDrivers([]);
          }
        } catch (err) {
          console.error('Error loading drivers for offer:', err);
          // Still attempt fallback to invited ids if available
          const offer = offers.find(o => o.id === selectedOfferId);
          const invitedIds = Array.isArray(offer?.invited_driver_ids) ? offer.invited_driver_ids : [];
          setDrivers(invitedIds.map(id => ({ id, DriverName: `Driver ${id}`, offerStatus: 'not_sent', isOnline: false })));
        }
      } else {
        setDrivers([]);
        setSelectedDriverId(null);
        setMessages([]);
      }
    };

    loadDriversForOffer();
  }, [selectedOfferId, offers]);

  // Load messages and manage room membership when selection changes
  useEffect(() => {
    const loadMessages = async () => {
      // If selection changed, leave previous room first
      if (socket && isConnected && prevOfferIdRef.current && prevDriverIdRef.current) {
        leaveRoom(prevOfferIdRef.current, prevDriverIdRef.current);
      }

      if (selectedOfferId && selectedDriverId) {
        try {
          setMessagesLoading(true);
          const response = await offersApi.getChatMessages(selectedOfferId, selectedDriverId);
          if (response.success) {
            setMessages(response.messages || []);
            // Join Socket.io room for real-time updates
            if (socket && isConnected) {
              joinRoom(selectedOfferId, selectedDriverId);
            }
          }
        } catch (err) {
          console.error('Error loading messages:', err);
          setMessages([]);
        } finally {
          setMessagesLoading(false);
        }
      } else {
        setMessages([]);
      }

      // Update previous selection refs after handling
      prevOfferIdRef.current = selectedOfferId || null;
      prevDriverIdRef.current = selectedDriverId || null;

    };

    loadMessages();
  }, [selectedOfferId, selectedDriverId, socket, isConnected, joinRoom, leaveRoom]);

  const handleOfferSelect = (offerId) => {
    setSelectedOfferId(offerId);
    setSelectedDriverId(null);
  };

  const handleDriverSelect = (driverId) => {
    setSelectedDriverId(driverId);
  };

  const handleSendMessage = async (messageText) => {
    if (!selectedOfferId || !selectedDriverId || !messageText.trim()) {
      return;
    }

    try {
      // Send message via API
      const response = await offersApi.sendChatMessage(selectedOfferId, selectedDriverId, messageText.trim());
      
      if (response.success) {
        // Create optimistic message for immediate UI update
        const newMessage = {
          id: response.id || Date.now(),
          message: messageText.trim(),
          sender_type: 'dispatcher',
          created_at: new Date().toISOString(),
          is_read: false
        };
        
        setMessages(prev => [...prev, newMessage]);
        
        // Emit via Socket.io for real-time delivery
        if (socket && isConnected) {
          emit('send_message', {
            offerId: selectedOfferId,
            driverId: selectedDriverId,
            message: messageText.trim(),
            messageId: newMessage.id
          });
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Could add toast notification here
    }
  };

  // CreateOfferModal functionality moved to App.js

  

  // Socket.io real-time event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Listen for new messages
    const handleNewMessage = (event) => {
      const messageData = event.detail;
      if (messageData.offerId === selectedOfferId && messageData.driverId === selectedDriverId) {
        setMessages(prev => {
          // Avoid duplicates
          const exists = prev.some(msg => msg.id === messageData.id);
          if (!exists) {
            return [...prev, messageData];
          }
          return prev;
        });
      }
    };

    // Listen for offer status updates
    const handleOfferStatusChange = (event) => {
      const statusData = event.detail;
      if (statusData.offerId) {
        // Update offer status in offers list
        setOffers(prev => prev.map(offer => 
          offer.id === statusData.offerId 
            ? { ...offer, status: statusData.status }
            : offer
        ));
        
        // Update driver status if it matches current selection
        if (statusData.driverId) {
          setDrivers(prev => prev.map(driver => 
            driver.id === statusData.driverId 
              ? { ...driver, offerStatus: statusData.status }
              : driver
          ));
        }
      }
    };

    // Listen for typing indicators
    const handleUserTyping = (event) => {
      const typingData = event.detail;
      if (typingData.offerId === selectedOfferId && typingData.driverId === selectedDriverId) {
        const flag = (typingData.isTyping !== undefined) ? typingData.isTyping : typingData.typing;
        setIsTyping(!!flag);
      }
    };

    // Listen for new offers
    const handleNewOffer = (event) => {
      const offerData = event.detail;
      setOffers(prev => {
        const exists = prev.some(offer => offer.id === offerData.id);
        if (!exists) {
          return [offerData, ...prev];
        }
        return prev;
      });
    };

    // Add event listeners
    window.addEventListener('socket_message_received', handleNewMessage);
    window.addEventListener('socket_offer_status_change', handleOfferStatusChange);
    window.addEventListener('socket_user_typing', handleUserTyping);
    window.addEventListener('socket_new_offer', handleNewOffer);

    // Cleanup
    return () => {
      window.removeEventListener('socket_message_received', handleNewMessage);
      window.removeEventListener('socket_offer_status_change', handleOfferStatusChange);
      window.removeEventListener('socket_user_typing', handleUserTyping);
      window.removeEventListener('socket_new_offer', handleNewOffer);
    };
  }, [socket, isConnected, selectedOfferId, selectedDriverId]);

  const handleSendOffer = async (driverId) => {
    if (!selectedOfferId) return;
    
    try {
      const response = await offersApi.sendOfferToDrivers(selectedOfferId, [driverId]);
      if (response.success) {
        // Update driver status to 'sent'
        setDrivers(prev => prev.map(driver => 
          driver.id === driverId 
            ? { ...driver, offerStatus: 'sent' }
            : driver
        ));
      }
    } catch (err) {
      console.error('Error sending offer to driver:', err);
    }
  };

  const selectedOffer = offers.find(offer => offer.id === selectedOfferId);
  const selectedDriver = drivers.find(driver => driver.id === selectedDriverId);

  if (isLoading) {
    return (
      <div className="offers-page">
        <div className="offers-loading-container">
          <div className="offers-loading-spinner"></div>
          <p>Loading offers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="offers-page">
        <div className="offers-error-container">
          <h3>Error Loading Offers</h3>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="retry-btn"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-page">
      {/* Back Button */}
      <div className="page-header">
        <h1>Driver Offers System</h1>
        <button onClick={onBack} className="back-btn">
          ← Back to Main
        </button>
      </div>

      {/* Top Zone - Offers Carousel */}
                        <OffersCarousel
                    offers={offers}
                    selectedOfferId={selectedOfferId}
                    onOfferSelect={handleOfferSelect}
                  />

      {/* Offer Details Panel */}
      <OfferDetailsPanel offer={selectedOffer} />

      {/* Bottom Zone - Drivers and Chat */}
      <div className="bottom-zone">
        {/* Left Zone - Drivers List */}
        <div className="left-zone">
          <DriversListPanel
            offer={selectedOffer}
            drivers={drivers}
            selectedDriverId={selectedDriverId}
            onDriverSelect={handleDriverSelect}
            onSendOffer={handleSendOffer}
          />
        </div>

        {/* Right Zone - Chat Window */}
        <div className="right-zone">
          <ChatWindow
            offer={selectedOffer}
            driver={selectedDriver}
            messages={messages}
            onSendMessage={handleSendMessage}
            isTyping={isTyping}
            onTypingStart={() => {
              // only emit; do not set local isTyping (that reflects remote user)
              if (socket && isConnected && selectedOfferId && selectedDriverId) {
                emit('typing_start', { offerId: selectedOfferId, driverId: selectedDriverId });
              }
            }}
            onTypingStop={() => {
              // only emit; do not set local isTyping
              if (socket && isConnected && selectedOfferId && selectedDriverId) {
                emit('typing_stop', { offerId: selectedOfferId, driverId: selectedDriverId });
              }
            }}
            isLoading={messagesLoading}
            socketConnected={isConnected}
          />
        </div>
      </div>

    </div>
  );
};

export default OffersPage;
