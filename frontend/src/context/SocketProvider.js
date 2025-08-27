import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export { SocketContext };

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Socket.io server URL - from offers-server
  const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://offers.connex.team';
  
  // Maximum reconnection attempts
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Get JWT token from localStorage
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('token');
  }, []);

  // Exponential backoff for reconnection
  const getReconnectDelay = useCallback((attempt) => {
    return Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
  }, []);

  // Connect to Socket.io server
  const connect = useCallback(() => {
    const token = getAuthToken();
    
    if (!token) {
      setError('No authentication token found');
      return;
    }

    if (socket?.connected) {
      return; // Already connected
    }

    setIsConnecting(true);
    setError(null);

    const newSocket = io(SOCKET_URL, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false // We'll handle reconnection manually
    });

    // Connection successful
    newSocket.on('connect', () => {
      console.log('Socket.io connected:', newSocket.id);
      setSocket(newSocket);
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      setReconnectAttempts(0);
    });

    // Connection error
    newSocket.on('connect_error', (err) => {
      console.error('Socket.io connection error:', err);
      setIsConnecting(false);
      setError(err.message || 'Connection failed');
      
      // Attempt reconnection with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay(reconnectAttempts);
        console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connect();
        }, delay);
      } else {
        setError('Max reconnection attempts reached');
      }
    });

    // Disconnection
    newSocket.on('disconnect', (reason) => {
      console.log('Socket.io disconnected:', reason);
      setIsConnected(false);
      setSocket(null);
      
      // Auto-reconnect unless it was a manual disconnect
      if (reason !== 'io client disconnect' && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay(reconnectAttempts);
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connect();
        }, delay);
      }
    });

    // Authentication error
    newSocket.on('auth_error', (err) => {
      console.error('Socket.io authentication error:', err);
      setError('Authentication failed');
      setIsConnecting(false);
      newSocket.disconnect();
    });

    // General error handling
    newSocket.on('error', (err) => {
      console.error('Socket.io error:', err);
      setError(err.message || 'Socket error');
    });

  }, [SOCKET_URL, getAuthToken, reconnectAttempts, getReconnectDelay, socket?.connected]);

  // Disconnect from Socket.io server
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setReconnectAttempts(0);
    }
  }, [socket]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    disconnect();
    setReconnectAttempts(0);
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

  // Join a specific offer chat room
  const joinOfferChat = useCallback((offerId, driverId) => {
    if (socket && isConnected) {
      socket.emit('join_offer_chat', { offerId, driverId });
    }
  }, [socket, isConnected]);

  // Leave a specific offer chat room
  const leaveOfferChat = useCallback((offerId, driverId) => {
    if (socket && isConnected) {
      socket.emit('leave_offer_chat', { offerId, driverId });
    }
  }, [socket, isConnected]);

  // Send a chat message
  const sendMessage = useCallback((offerId, driverId, message, messageType = 'text') => {
    if (socket && isConnected) {
      socket.emit('send_message', {
        offerId,
        driverId,
        message,
        messageType
      });
    }
  }, [socket, isConnected]);

  // Send typing indicator
  const sendTypingStart = useCallback((offerId, driverId) => {
    if (socket && isConnected) {
      socket.emit('typing_start', { offerId, driverId });
    }
  }, [socket, isConnected]);

  const sendTypingStop = useCallback((offerId, driverId) => {
    if (socket && isConnected) {
      socket.emit('typing_stop', { offerId, driverId });
    }
  }, [socket, isConnected]);

  // Mark message as read
  const markMessageRead = useCallback((messageId) => {
    if (socket && isConnected) {
      socket.emit('mark_message_read', { messageId });
    }
  }, [socket, isConnected]);

  // Send heartbeat to maintain presence
  const sendHeartbeat = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('heartbeat');
    }
  }, [socket, isConnected]);

  // Initialize connection on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token && !socket) {
      connect();
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [getAuthToken, connect, socket]);

  // Heartbeat interval
  useEffect(() => {
    if (isConnected) {
      const heartbeatInterval = setInterval(sendHeartbeat, 30000); // Every 30 seconds
      return () => clearInterval(heartbeatInterval);
    }
  }, [isConnected, sendHeartbeat]);

  // Context value
  const value = {
    socket,
    isConnected,
    isConnecting,
    error,
    reconnectAttempts,
    connect,
    disconnect,
    reconnect,
    joinOfferChat,
    leaveOfferChat,
    sendMessage,
    sendTypingStart,
    sendTypingStop,
    markMessageRead,
    sendHeartbeat
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;
