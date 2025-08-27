import React, { useState, useRef, useEffect, useContext } from 'react';
import { SocketContext } from '../context/SocketProvider';
import './ChatWindow.css';

const ChatWindow = ({ offer, driver, user }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const { socket, joinOfferChat, leaveOfferChat, sendMessage, emitTyping, emitStopTyping } = useContext(SocketContext);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Join chat when offer and driver are selected
  useEffect(() => {
    if (offer && driver && socket) {
      const chatId = `offer_${offer.id}_driver_${driver.id}`;
      joinOfferChat(chatId);
      setIsConnected(true);

      // Load existing messages for this chat
      loadChatMessages(chatId);

      return () => {
        leaveOfferChat(chatId);
        setIsConnected(false);
      };
    }
  }, [offer, driver, socket, joinOfferChat, leaveOfferChat]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (messageData) => {
      setMessages(prev => [...prev, {
        id: messageData.id || Date.now(),
        content: messageData.content,
        sender_id: messageData.sender_id,
        sender_name: messageData.sender_name,
        sender_type: messageData.sender_type,
        timestamp: messageData.timestamp || new Date().toISOString(),
        is_read: messageData.is_read || false
      }]);
    };

    const handleTypingStart = (data) => {
      if (data.user_id !== user?.id) {
        setTypingUsers(prev => {
          if (!prev.find(u => u.user_id === data.user_id)) {
            return [...prev, { user_id: data.user_id, user_name: data.user_name }];
          }
          return prev;
        });
      }
    };

    const handleTypingStop = (data) => {
      setTypingUsers(prev => prev.filter(u => u.user_id !== data.user_id));
    };

    const handleMessageRead = (data) => {
      setMessages(prev => prev.map(msg => 
        msg.id === data.message_id ? { ...msg, is_read: true } : msg
      ));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleTypingStart);
    socket.on('user_stop_typing', handleTypingStop);
    socket.on('message_read', handleMessageRead);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleTypingStart);
      socket.off('user_stop_typing', handleTypingStop);
      socket.off('message_read', handleMessageRead);
    };
  }, [socket, user]);

  const loadChatMessages = async (chatId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`https://connex.team/api/chat/messages/${chatId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !offer || !driver) return;

    const messageData = {
      offer_id: offer.id,
      driver_id: driver.id,
      content: newMessage.trim(),
      sender_id: user.id,
      sender_name: user.full_name || user.username,
      sender_type: 'dispatcher'
    };

    sendMessage(messageData);
    setNewMessage('');
    handleStopTyping();
  };

  const handleTypingChange = (e) => {
    setNewMessage(e.target.value);
    
    if (!isTyping && offer && driver) {
      setIsTyping(true);
      emitTyping({
        offer_id: offer.id,
        driver_id: driver.id,
        user_id: user.id,
        user_name: user.full_name || user.username
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 1000);
  };

  const handleStopTyping = () => {
    if (isTyping && offer && driver) {
      setIsTyping(false);
      emitStopTyping({
        offer_id: offer.id,
        driver_id: driver.id,
        user_id: user.id
      });
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isMyMessage = (message) => {
    return message.sender_id === user?.id;
  };

  if (!offer || !driver) {
    return (
      <div className="chat-window">
        <div className="no-chat-selected">
          <div className="no-chat-content">
            <div className="no-chat-icon">💬</div>
            <h3>No Chat Selected</h3>
            <p>Select an offer and driver to start chatting</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-info">
          <div className="driver-info">
            <span className="driver-name">
              {driver.name}
              <span className={`online-status ${driver.isOnline ? 'online' : 'offline'}`}>
                {driver.isOnline ? '🟢' : '🔴'}
              </span>
            </span>
            <span className="truck-info">Truck #{driver.truckNumber}</span>
          </div>
          <div className="offer-info">
            <span className="offer-id">Offer #{offer.id}</span>
            <span className="connection-status">
              {isConnected ? '🔗 Connected' : '⚠️ Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="messages-area">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${isMyMessage(message) ? 'my-message' : 'their-message'}`}
              >
                <div className="message-content">
                  <div className="message-text">{message.content}</div>
                  <div className="message-meta">
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                    {isMyMessage(message) && (
                      <span className={`read-status ${message.is_read ? 'read' : 'sent'}`}>
                        {message.is_read ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
                {!isMyMessage(message) && (
                  <div className="sender-name">{message.sender_name}</div>
                )}
              </div>
            ))}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                <div className="typing-content">
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="typing-text">
                    {typingUsers[0].user_name} is typing...
                  </span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="message-input-area">
        <form onSubmit={handleSendMessage} className="message-form">
          <div className="input-container">
            <input
              type="text"
              value={newMessage}
              onChange={handleTypingChange}
              onBlur={handleStopTyping}
              placeholder={`Message ${driver.name}...`}
              className="message-input"
              disabled={!isConnected}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!newMessage.trim() || !isConnected}
            >
              📤
            </button>
          </div>
        </form>
        
        <div className="input-footer">
          <span className="connection-indicator">
            {isConnected ? (
              <span className="connected">🟢 Connected</span>
            ) : (
              <span className="disconnected">🔴 Disconnected</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
