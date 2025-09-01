import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ 
  offer, 
  driver, 
  messages = [], 
  onSendMessage,
  isTyping = false,
  onTypingStart,
  onTypingStop
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (driver) {
      setNewMessage('');
    }
  }, [driver]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);
    
    // Handle typing indicators
    if (onTypingStart && onTypingStop) {
      if (value.length > 0) {
        onTypingStart();
        
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        // Set new timeout to stop typing indicator
        typingTimeoutRef.current = setTimeout(() => {
          onTypingStop();
        }, 2000);
      } else {
        onTypingStop();
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !onSendMessage) return;
    
    setIsSending(true);
    
    try {
      await onSendMessage(newMessage.trim());
      setNewMessage('');
      
      // Stop typing indicator
      if (onTypingStop) {
        onTypingStop();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (!offer || !driver) {
    return (
      <div className="chat-window">
        <div className="chat-header">
          <h3>Chat</h3>
        </div>
        <div className="no-chat-selected">
          <p>Select a driver to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
                        <div className="chat-header">
                    <div className="chat-driver-info">
                      <h3>Chat with {driver.DriverName || driver.driver_name}</h3>
                      <div className="driver-subtitle">
                        Truck #{driver.TruckNumber || driver.truck_number}
                      </div>
                    </div>
                    
                    <div className="offer-info">
                      <div className="offer-route">
                        {offer.pickup_location?.split(',')[0]} → {offer.delivery_location?.split(',')[0]}
                      </div>
                      <div className="offer-details">
                        <span className="detail-item">
                          <span className="detail-icon">💰</span>
                          ${offer.proposed_rate}/mile
                        </span>
                        {offer.weight_lbs && (
                          <span className="detail-item">
                            <span className="detail-icon">⚖️</span>
                            {offer.weight_lbs} lbs
                          </span>
                        )}
                        {offer.distance_miles && (
                          <span className="detail-item">
                            <span className="detail-icon">📏</span>
                            {offer.distance_miles} miles
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`message ${message.sender_type === 'dispatcher' ? 'sent' : 'received'}`}
            >
              <div className="message-content">
                <div className="message-text">{message.message}</div>
                <div className="message-time">
                  {formatTime(message.created_at)}
                  {message.sender_type === 'dispatcher' && (
                    <span className={`read-status ${message.is_read ? 'read' : 'unread'}`}>
                      {message.is_read ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        
        {isTyping && (
          <div className="message received">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

                        <div className="chat-actions">
                    <button 
                      className="accept-driver-btn"
                      onClick={() => {
                        // TODO: Implement accept driver logic
                        console.log('Accept driver for load:', driver.id);
                      }}
                    >
                      ✅ Accept Driver
                    </button>
                    <button 
                      className="reject-driver-btn"
                      onClick={() => {
                        // TODO: Implement reject driver logic
                        console.log('Reject driver for load:', driver.id);
                      }}
                    >
                      ❌ Reject Driver
                    </button>
                  </div>
                  
                  <form className="chat-input-form" onSubmit={handleSubmit}>
                    <div className="chat-input-container">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={handleInputChange}
                        placeholder="Type your message..."
                        disabled={isSending}
                        className="chat-input"
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim() || isSending}
                        className="send-button"
                      >
                        {isSending ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </form>
    </div>
  );
};

export default ChatWindow;
