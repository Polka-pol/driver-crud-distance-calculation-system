import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

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
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [maxReconnectAttempts] = useState(5);
  const isConnectingRef = useRef(false);

  const connect = useCallback(async () => {
    try {
      // Prevent multiple connections
      if (isConnectingRef.current) {
        console.log('Socket connection is in progress, skipping duplicate connect');
        return;
      }
      if (socket && socket.connected) {
        console.log('Socket already connected, skipping...');
        return;
      }

      // Get JWT token from localStorage or wherever it's stored
      const token = localStorage.getItem('connex_jwt') || sessionStorage.getItem('connex_jwt');
      
      if (!token) {
        console.warn('No JWT token found for socket connection');
        setConnectionError('Authentication required');
        return;
      }

      // Disconnect existing socket if any
      if (socket) {
        // If a stale socket exists, ensure it is fully closed before creating a new one
        try { socket.removeAllListeners && socket.removeAllListeners(); } catch (_) {}
        socket.disconnect();
        setSocket(null);
      }

      console.log('Attempting to connect to Socket.io server...');

      // Create socket connection
      isConnectingRef.current = true;
      const newSocket = io('https://offers.connex.team', {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 30000,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        // Avoid forcing a brand new connection each time to reduce resource spikes
        autoConnect: true,
        withCredentials: true
      });

      // Connection events
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
        setConnectionError(null);
        setReconnectAttempts(0);
        isConnectingRef.current = false;
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        isConnectingRef.current = false;
        
        if (reason === 'io server disconnect') {
          // Server disconnected us, try to reconnect
          newSocket.connect();
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        console.error('Error details:', {
          message: error.message,
          description: error.description,
          context: error.context,
          type: error.type
        });
        setConnectionError(error.message || 'Connection failed');
        setIsConnected(false);
        isConnectingRef.current = false;
        
        if (reconnectAttempts < maxReconnectAttempts) {
          setReconnectAttempts(prev => prev + 1);
        }
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts');
        setIsConnected(true);
        setConnectionError(null);
        isConnectingRef.current = false;
      });

      newSocket.on('reconnect_failed', () => {
        console.error('Socket reconnection failed after', maxReconnectAttempts, 'attempts');
        setConnectionError('Failed to reconnect after multiple attempts');
        setIsConnected(false);
        isConnectingRef.current = false;
      });

      // Chat events
      newSocket.on('receive_message', (messageData) => {
        console.log('Received message:', messageData);
        // Emit custom event for message handling
        window.dispatchEvent(new CustomEvent('socket_message_received', { detail: messageData }));
      });

      newSocket.on('chat_history', (data) => {
        console.log('Received chat history:', data);
        window.dispatchEvent(new CustomEvent('socket_chat_history', { detail: data }));
      });

      newSocket.on('user_typing', (data) => {
        console.log('User typing:', data);
        window.dispatchEvent(new CustomEvent('socket_user_typing', { detail: data }));
      });

      // Offer events
      // Backward-compat: some clients might emit 'new_offer_received'
      newSocket.on('new_offer_received', (data) => {
        console.log('New offer received (legacy):', data);
        window.dispatchEvent(new CustomEvent('socket_new_offer', { detail: data }));
      });
      // Server emits 'offer_created' on webhook
      newSocket.on('offer_created', (offer) => {
        console.log('Offer created (server):', offer);
        window.dispatchEvent(new CustomEvent('socket_new_offer', { detail: offer }));
      });

      newSocket.on('offer_status_change', (data) => {
        console.log('Offer status changed:', data);
        window.dispatchEvent(new CustomEvent('socket_offer_status_change', { detail: data }));
      });

      // Hold events
      newSocket.on('hold_placed', (data) => {
        console.log('Hold placed:', data);
        window.dispatchEvent(new CustomEvent('socket_hold_placed', { detail: data }));
      });

      newSocket.on('hold_removed', (data) => {
        console.log('Hold removed:', data);
        window.dispatchEvent(new CustomEvent('socket_hold_removed', { detail: data }));
      });

      newSocket.on('hold_expired', (data) => {
        console.log('Hold expired:', data);
        window.dispatchEvent(new CustomEvent('socket_hold_expired', { detail: data }));
      });

      // Error events
      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
        window.dispatchEvent(new CustomEvent('socket_error', { detail: error }));
      });

      setSocket(newSocket);

    } catch (error) {
      console.error('Failed to create socket connection:', error);
      setConnectionError(error.message);
      isConnectingRef.current = false;
    }
  }, [maxReconnectAttempts, reconnectAttempts, socket]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  const emit = useCallback((event, data) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  }, [socket, isConnected]);

  const joinRoom = useCallback((offerId, driverId) => {
    if (socket && isConnected && offerId && driverId) {
      socket.emit('join_offer_chat', { offerId, driverId });
    }
  }, [socket, isConnected]);

  const leaveRoom = useCallback((offerId, driverId) => {
    if (socket && isConnected && offerId && driverId) {
      socket.emit('leave_offer_chat', { offerId, driverId });
    }
  }, [socket, isConnected]);

  // Auto-connect when component mounts, but only if JWT token exists
  useEffect(() => {
    let mounted = true;
    
    // Перевіряємо наявність JWT токена перед підключенням
    const token = localStorage.getItem('connex_jwt') || sessionStorage.getItem('connex_jwt');
    
    if (token) {
      const timer = setTimeout(() => {
        if (mounted) {
          console.log('JWT token found, initializing socket connection...');
          connect();
        }
      }, 1000);
      
      return () => {
        mounted = false;
        clearTimeout(timer);
        disconnect();
      };
    } else {
      console.log('No JWT token found, skipping socket connection');
      return () => {
        mounted = false;
      };
    }
  }, [connect, disconnect]);

  // Optional: pause reconnection attempts when tab is hidden to avoid resource spikes
  useEffect(() => {
    const onVisibility = () => {
      // Перевіряємо наявність JWT токена перед спробою відновлення з'єднання
      const token = localStorage.getItem('connex_jwt') || sessionStorage.getItem('connex_jwt');
      
      if (!document.hidden && token && socket && !socket.connected && !isConnectingRef.current) {
        console.log('Tab visible again and JWT token exists, ensuring socket connection...');
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [socket, connect]);

  const value = {
    socket,
    isConnected,
    connectionError,
    reconnectAttempts,
    emit,
    joinRoom,
    leaveRoom,
    connect,
    disconnect,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;



