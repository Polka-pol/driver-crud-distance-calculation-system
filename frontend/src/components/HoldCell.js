import React, { useState, useEffect } from 'react';

const HoldCell = ({ truck, currentUserId, onHoldClick, onRemoveHold, onHoldExpired, serverTimeOffset = 0 }) => {
  const [timeLeft, setTimeLeft] = useState(null);
  const [showHoldButton, setShowHoldButton] = useState(false);
  const [hasTriggeredExpired, setHasTriggeredExpired] = useState(false);

  const isOnHold = truck.hold_status === 'active';
  const canRemoveHold = truck.hold_dispatcher_id === currentUserId;
  const loadsMark = truck.loads_mark || '-';

  // Calculate time remaining with real-time countdown using server time
  useEffect(() => {
    if (!isOnHold || !truck.hold_started_at) {
      setTimeLeft(null);
      setHasTriggeredExpired(false);
      return;
    }

    const calculateTimeLeft = () => {
      // Use server time (hold_started_at) and adjust for server time offset
      const startTime = new Date(truck.hold_started_at);
      const now = new Date();
      
      // Adjust for server time offset if provided
      const adjustedNow = new Date(now.getTime() + serverTimeOffset);
      
      // Calculate elapsed time since hold was placed
      const elapsedMs = adjustedNow - startTime;
      const totalRemainingMs = Math.max(0, (15 * 60 * 1000) - elapsedMs);
      
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
  }, [truck.hold_started_at, isOnHold, serverTimeOffset, onHoldExpired, truck.id, hasTriggeredExpired]);

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