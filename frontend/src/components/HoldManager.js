import React from 'react';
import { useSocket } from '../context/SocketProvider';

/**
 * Hook for managing hold operations via Socket.io
 */
export const useHoldManager = () => {
  const { socket, isConnected } = useSocket();

  const placeHold = (truckId, dispatcherId, dispatcherName) => {
    if (!socket || !isConnected) {
      alert('Connection lost. Please check your internet connection.');
      return false;
    }

    socket.emit('place_hold', {
      truckId,
      dispatcherId,
      dispatcherName
    });
    
    return true;
  };

  const removeHold = (truckId, dispatcherId) => {
    if (!socket || !isConnected) {
      alert('Connection lost. Please check your internet connection.');
      return false;
    }

    socket.emit('remove_hold', {
      truckId,
      dispatcherId
    });
    
    return true;
  };

  const getActiveHolds = () => {
    if (!socket || !isConnected) {
      return false;
    }

    socket.emit('get_active_holds');
    return true;
  };

  return {
    placeHold,
    removeHold,
    getActiveHolds,
    isConnected
  };
};
