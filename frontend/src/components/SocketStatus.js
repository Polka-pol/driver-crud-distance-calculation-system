import React from 'react';
import { useSocket } from '../context/SocketProvider';
import './SocketStatus.css';

const SocketStatus = () => {
  const { isConnected, connectionError, reconnectAttempts } = useSocket();

  const getStatusClass = () => {
    if (connectionError) return 'error';
    if (isConnected) return 'connected';
    if (reconnectAttempts > 0) return 'connecting';
    return 'disconnected';
  };

  const getStatusText = () => {
    if (connectionError) return 'Connection Error';
    if (isConnected) return 'Connected';
    if (reconnectAttempts > 0) return `Reconnecting (${reconnectAttempts})`;
    return 'Disconnected';
  };

  if (isConnected && !connectionError) {
    return null; // Don't show anything when connected
  }

  return (
    <>
      <div className={`socket-status ${getStatusClass()}`}>
        {getStatusText()}
      </div>
      
      {connectionError && (
        <div className="connection-error">
          {connectionError}
        </div>
      )}
      
      {reconnectAttempts > 0 && !isConnected && (
        <div className="reconnecting">
          <div className="reconnecting-spinner"></div>
          Attempting to reconnect...
        </div>
      )}
    </>
  );
};

export default SocketStatus;

