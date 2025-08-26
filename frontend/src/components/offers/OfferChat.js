import React, { useState, useEffect, useRef } from 'react';
import { supabaseHelpers } from '../../supabaseClient';
import { useAuth } from '../../context/HybridAuthContext';
import './OfferChat.css';

const OfferChat = ({ offer, load, onStatusUpdate }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [priceOffer, setPriceOffer] = useState('');
  const [showPriceInput, setShowPriceInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const [messageSubscription, setMessageSubscription] = useState(null);

  useEffect(() => {
    if (!offer) return;

    fetchMessages();
    setupMessageSubscription();

    return () => {
      if (messageSubscription) {
        messageSubscription.unsubscribe();
      }
    };
  }, [offer?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseHelpers.messages.getByOfferId(offer.id);
      
      if (error) throw error;
      
      setMessages(data || []);
      
      // Mark messages as read
      await supabaseHelpers.messages.markAsRead(offer.id, 'driver');
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const setupMessageSubscription = () => {
    const subscription = supabaseHelpers.realtime.subscribeToOfferMessages(
      offer.id,
      (payload) => {
        console.log('Message realtime event:', payload);
        
        if (payload.eventType === 'INSERT') {
          setMessages(prev => [...prev, payload.new]);
          
          // Auto-mark new driver messages as read
          if (payload.new.sender_type === 'driver') {
            supabaseHelpers.messages.markAsRead(offer.id, 'driver');
          }
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(msg => 
            msg.id === payload.new.id ? payload.new : msg
          ));
        }
      }
    );
    
    setMessageSubscription(subscription);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (messageType = 'text', messageText = '', priceAmount = null) => {
    if (!user || (!messageText.trim() && messageType === 'text')) return;

    try {
      setSending(true);
      setError(null);

      const messageData = {
        offer_id: offer.id,
        sender_type: 'dispatcher',
        sender_user_id: user.id,
        message_type: messageType,
        message_text: messageText.trim(),
        price_amount: priceAmount,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabaseHelpers.messages.send(messageData);
      
      if (error) throw error;

      // Clear inputs
      setNewMessage('');
      setPriceOffer('');
      setShowPriceInput(false);

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error.message);
    } finally {
      setSending(false);
    }
  };

  const handleSendText = () => {
    sendMessage('text', newMessage);
  };

  const handleSendPrice = () => {
    const amount = parseFloat(priceOffer);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid price amount');
      return;
    }
    sendMessage('price_offer', `Proposed rate: $${amount}`, amount);
  };

  const handleConfirmDriver = async () => {
    if (!window.confirm('Are you sure you want to accept this driver for the load?')) {
      return;
    }

    try {
      setSending(true);
      setError(null);

      // Update offer status to accepted
      const { data, error } = await supabaseHelpers.loadOffers.updateStatus(
        offer.id, 
        'accepted',
        { responded_at: new Date().toISOString() }
      );
      
      if (error) throw error;

      // Send system message
      await sendMessage('system', 'Driver confirmed for this load! 🎉');

      // Update parent component
      if (onStatusUpdate) {
        onStatusUpdate(offer.id, 'accepted', { responded_at: new Date().toISOString() });
      }

    } catch (error) {
      console.error('Error confirming driver:', error);
      setError(error.message);
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageContent = (message) => {
    if (message.message_type === 'price_offer') {
      return (
        <div className="price-offer-message">
          <div className="price-amount">${message.price_amount}</div>
          <div className="price-text">{message.message_text}</div>
        </div>
      );
    }
    return message.message_text;
  };

  if (!offer) {
    return (
      <div className="offer-chat">
        <div className="no-offer-selected">
          <p>Select a driver to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="offer-chat">
      <div className="chat-header">
        <div className="offer-info">
          <h3>Chat with Driver #{offer.driver_user_id?.slice(-8) || 'Unknown'}</h3>
          <div className="offer-status">
            Status: <span className={`status ${offer.offer_status}`}>
              {offer.offer_status.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div className="load-info">
          <div className="route">
            {load?.origin_address} → {load?.destination_address}
          </div>
          <div className="load-details">
            {load?.weight && <span>Weight: {load.weight} lbs</span>}
            {load?.proposed_cost_by_user && <span>Rate: ${load.proposed_cost_by_user}</span>}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="messages-container">
        {loading ? (
          <div className="loading-messages">
            <div className="spinner"></div>
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map(message => (
              <div 
                key={message.id} 
                className={`message ${message.sender_type}`}
              >
                <div className="message-content">
                  {getMessageContent(message)}
                </div>
                <div className="message-meta">
                  <span className="message-time">
                    {formatMessageTime(message.created_at)}
                  </span>
                  {message.sender_type === 'dispatcher' && (
                    <span className="sender-label">You</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="chat-actions">
        {offer.offer_status !== 'accepted' && offer.offer_status !== 'completed' && (
          <div className="action-buttons">
            <button 
              onClick={() => setShowPriceInput(!showPriceInput)}
              className="action-btn price-btn"
              disabled={sending}
            >
              💰 Propose Price
            </button>
            <button 
              onClick={handleConfirmDriver}
              className="action-btn confirm-btn"
              disabled={sending}
            >
              ✅ Confirm Driver
            </button>
          </div>
        )}

        {showPriceInput && (
          <div className="price-input-section">
            <div className="price-input-group">
              <input
                type="number"
                value={priceOffer}
                onChange={(e) => setPriceOffer(e.target.value)}
                placeholder="Enter price amount"
                min="0"
                step="0.01"
                className="price-input"
              />
              <button 
                onClick={handleSendPrice}
                disabled={sending || !priceOffer}
                className="send-price-btn"
              >
                Send Price
              </button>
              <button 
                onClick={() => setShowPriceInput(false)}
                className="cancel-price-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="message-input-section">
          <div className="message-input-group">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="message-input"
              onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
              disabled={sending}
            />
            <button 
              onClick={handleSendText}
              disabled={sending || !newMessage.trim()}
              className="send-btn"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfferChat;
