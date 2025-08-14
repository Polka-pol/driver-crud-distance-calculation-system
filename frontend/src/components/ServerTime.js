import React, { useEffect, useState } from 'react';
import { formatTimeInAppTZ } from '../utils/timeUtils';

const ServerTime = ({ serverTimeOffset = 0, isSyncing = false }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const display = formatTimeInAppTZ(new Date(currentTime.getTime() + (serverTimeOffset || 0)));

  return (
    <span className={`server-time ${isSyncing ? 'syncing' : ''}`}>{isSyncing ? '⏳' : display}</span>
  );
};

export default ServerTime; 