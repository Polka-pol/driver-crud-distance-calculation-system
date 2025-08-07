import React, { useState, useEffect } from 'react';
import { getCurrentEDT } from '../utils/timeUtils';

const HoldCell = ({ truck, currentUserId, onHoldClick, onRemoveHold, onHoldExpired, serverTimeOffset = 0 }) => {
  // Component for displaying hold status and countdown timer using EDT timezone
  const [timeLeft, setTimeLeft] = useState(null);
  const [showHoldButton, setShowHoldButton] = useState(false);
  const [hasTriggeredExpired, setHasTriggeredExpired] = useState(false);

  const isOnHold = truck.hold_status === 'active';
  const canRemoveHold = truck.hold_dispatcher_id === currentUserId;
  const loadsMark = truck.loads_mark || '-';

  // Calculate time remaining with real-time countdown using EDT time
  useEffect(() => {
    if (!isOnHold || !truck.hold_started_at) {
      setTimeLeft(null);
      setHasTriggeredExpired(false);
      return;
    }

    const calculateTimeLeft = () => {
      // Server provides hold_started_at directly in EDT
      const startTimeEDT = new Date(truck.hold_started_at);
      
      // Get current time in EDT timezone
      const currentTimeEDT = getCurrentEDT();
      
      // Calculate elapsed time since hold was placed in EDT
      const elapsedMs = currentTimeEDT - startTimeEDT;
      const totalRemainingMs = Math.max(0, (15 * 60 * 1000) - elapsedMs); // 15 minutes in milliseconds
      
      if (totalRemainingMs <= 0) {
        setTimeLeft('EXPIRED');
        // Trigger a refresh to update hold status immediately (only once)
        if (onHoldExpired && !hasTriggeredExpired) {
          setHasTriggeredExpired(true);
          onHoldExpired(truck.id);
        }
        return;
      }
      
      const remainingMinutes = Math.floor(totalRemainingMs / (1000 * 60));
      const remainingSeconds = Math.floor((totalRemainingMs % (1000 * 60)) / 1000);
      
      setTimeLeft(`${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`);
    };

    // Calculate immediately
    calculateTimeLeft();
    
    // Update every second
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [truck.hold_started_at, isOnHold, onHoldExpired, truck.id, hasTriggeredExpired]);

  // Reset hasTriggeredExpired when hold status changes
  useEffect(() => {
    if (!isOnHold) {
      setHasTriggeredExpired(false);
    }
  }, [isOnHold]);

  const handleHoldClick = () => {
    if (onHoldClick) {
      onHoldClick(truck.id);
    }
  };

  const handleRemoveHold = () => {
    if (canRemoveHold && onRemoveHold) {
      onRemoveHold(truck.id);
    }
  };

  if (isOnHold && timeLeft !== 'EXPIRED') {
    return (
      <div className="hold-cell">
        <div 
          className={`hold-badge ${canRemoveHold ? 'clickable' : ''}`}
          onClick={canRemoveHold ? handleRemoveHold : undefined}
          title={canRemoveHold ? 'Click to remove hold' : `Hold by: ${truck.hold_dispatcher_name}`}
        >
          ON HOLD
        </div>
        <div className="hold-countdown">
          {timeLeft}
        </div>
        {!canRemoveHold && truck.hold_dispatcher_name && (
          <div className="hold-tooltip">
            Hold by: {truck.hold_dispatcher_name}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="hold-cell"
      onMouseEnter={() => setShowHoldButton(true)}
      onMouseLeave={() => setShowHoldButton(false)}
    >
      <div className="loads-mark-value">
        {loadsMark}
      </div>
      <button 
        className={`hold-button ${showHoldButton ? 'visible' : ''}`}
        onClick={handleHoldClick}
        title="Place 15-minute hold"
      >
        🔒 HOLD
      </button>
    </div>
  );
};

export default HoldCell; 