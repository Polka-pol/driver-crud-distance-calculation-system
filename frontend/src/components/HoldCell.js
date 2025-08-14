import React, { useState, useEffect, useRef } from 'react';
import { parseAppTzDateTimeToEpochMs } from '../utils/timeUtils';

const HoldCell = ({ truck, currentUserId, onHoldClick, onRemoveHold, onHoldExpired, serverTimeOffset = 0 }) => {
  // Component for displaying hold status and countdown timer using EDT timezone
  const [timeLeft, setTimeLeft] = useState(null);
  const [showHoldButton, setShowHoldButton] = useState(false);
  const [hasTriggeredExpired, setHasTriggeredExpired] = useState(false);

  const isOnHold = truck.hold_status === 'active';
  const canRemoveHold = truck.hold_dispatcher_id === currentUserId;
  const loadsMark = truck.loads_mark || '-';

  const intervalRef = useRef(null);
  const hasTriggeredExpiredRef = useRef(false);

  useEffect(() => {
    hasTriggeredExpiredRef.current = hasTriggeredExpired;
  }, [hasTriggeredExpired]);

  // Calculate time remaining with real-time countdown using App TZ robust parsing and epoch math
  useEffect(() => {
    if (!isOnHold || !truck.hold_started_at) {
      setTimeLeft(null);
      setHasTriggeredExpired(false);
      return;
    }

    // Parse server UTC naive timestamp ("YYYY-MM-DD HH:mm:ss") robustly as UTC
    const safeParseUtcNaiveToEpochMs = (value) => {
      if (!value) return NaN;
      const str = String(value).trim();
      if (!str) return NaN;
      const iso = str.includes('T') ? str : str.replace(' ', 'T');
      const withZ = /Z$/i.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
      const ms = Date.parse(withZ);
      return Number.isNaN(ms) ? NaN : ms;
    };

    // Prefer strict UTC parse; fall back to App TZ parser if needed
    let startEpoch = safeParseUtcNaiveToEpochMs(truck.hold_started_at);
    if (!Number.isFinite(startEpoch)) {
      startEpoch = parseAppTzDateTimeToEpochMs(truck.hold_started_at);
    }
    if (!Number.isFinite(startEpoch)) {
      setTimeLeft('Invalid');
      return;
    }

    // Compute initial remaining synchronously to avoid scheduling timers when already expired
    const now0 = Date.now() + (Number.isFinite(serverTimeOffset) ? serverTimeOffset : 0);
    const elapsed0 = Math.max(0, now0 - startEpoch);
    const remaining0 = Math.max(0, 15 * 60 * 1000 - elapsed0);
    if (remaining0 <= 0) {
      setTimeLeft('EXPIRED');
      if (onHoldExpired && !hasTriggeredExpiredRef.current) {
        hasTriggeredExpiredRef.current = true; // prevent double-calls before state syncs
        setHasTriggeredExpired(true);
        onHoldExpired(truck.id);
      }
      return;
    }

    const update = () => {
      // Use UTC epoch math plus server offset (robust across client timezones)
      const nowMs = Date.now() + (Number.isFinite(serverTimeOffset) ? serverTimeOffset : 0);
      const elapsedMs = Math.max(0, nowMs - startEpoch);
      const remainingMs = Math.max(0, 15 * 60 * 1000 - elapsedMs);

      if (remainingMs <= 0) {
        setTimeLeft('EXPIRED');
        if (onHoldExpired && !hasTriggeredExpiredRef.current) {
          hasTriggeredExpiredRef.current = true; // prevent double-calls before state syncs
          setHasTriggeredExpired(true);
          onHoldExpired(truck.id);
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const totalSeconds = Math.floor(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    // Initial display
    const totalSeconds0 = Math.floor(remaining0 / 1000);
    const minutes0 = Math.floor(totalSeconds0 / 60);
    const seconds0 = totalSeconds0 % 60;
    setTimeLeft(`${minutes0}:${seconds0.toString().padStart(2, '0')}`);

    // Align next tick to the next second to reduce drift, then tick every 1s
    const now = Date.now() + (Number.isFinite(serverTimeOffset) ? serverTimeOffset : 0);
    const msToNextSecond = 1000 - (now % 1000);
    const startAligned = setTimeout(() => {
      update();
      intervalRef.current = setInterval(update, 1000);
    }, msToNextSecond);

    return () => {
      clearTimeout(startAligned);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [truck.hold_started_at, isOnHold, onHoldExpired, truck.id, serverTimeOffset]);

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
          aria-label={canRemoveHold ? 'Remove hold' : 'On hold'}
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