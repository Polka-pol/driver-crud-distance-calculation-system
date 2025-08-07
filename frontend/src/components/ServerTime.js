import React, { useState, useEffect } from 'react';
import { getCurrentEDT, formatEDTTime } from '../utils/timeUtils';

const ServerTime = ({ serverTimeOffset, isSyncing = false }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getServerTime = () => {
    // Get current time in EDT with server offset
    const edtTime = getCurrentEDT(serverTimeOffset);
    return formatEDTTime(edtTime);
  };

  return (
    <span className={`server-time ${isSyncing ? 'syncing' : ''}`}>
      {isSyncing ? '⏳' : `EDT ${getServerTime()}`}
    </span>
  );
};

export default ServerTime; 