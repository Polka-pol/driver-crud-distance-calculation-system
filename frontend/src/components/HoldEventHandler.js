import { useEffect } from 'react';

/**
 * Component to handle Socket.io hold events and update truck state
 */
const HoldEventHandler = ({ trucks, setTrucks, onHoldExpired }) => {

  useEffect(() => {
    const handleHoldPlaced = (event) => {
      const { truckId, dispatcherId, dispatcherName, startedAt } = event.detail;
      
      setTrucks(prevTrucks => 
        prevTrucks.map(truck => 
          truck.id === parseInt(truckId) 
            ? {
                ...truck,
                hold_status: 'active',
                hold_started_at: startedAt,
                hold_dispatcher_id: dispatcherId,
                hold_dispatcher_name: dispatcherName
              }
            : truck
        )
      );
      
      console.log(`Hold placed on truck ${truckId} by ${dispatcherName}`);
    };

    const handleHoldRemoved = (event) => {
      const { truckId } = event.detail;
      
      setTrucks(prevTrucks => 
        prevTrucks.map(truck => 
          truck.id === parseInt(truckId) 
            ? {
                ...truck,
                hold_status: null,
                hold_started_at: null,
                hold_dispatcher_id: null,
                hold_dispatcher_name: null
              }
            : truck
        )
      );
      
      console.log(`Hold removed from truck ${truckId}`);
    };

    const handleHoldExpired = (event) => {
      const { truckId } = event.detail;
      
      setTrucks(prevTrucks => 
        prevTrucks.map(truck => 
          truck.id === parseInt(truckId) 
            ? {
                ...truck,
                hold_status: 'expired',
                hold_started_at: null,
                hold_dispatcher_id: null,
                hold_dispatcher_name: null
              }
            : truck
        )
      );
      
      if (onHoldExpired) {
        onHoldExpired(truckId);
      }
      
      console.log(`Hold expired on truck ${truckId}`);
    };

    // Subscribe to window custom events from SocketProvider
    window.addEventListener('socket_hold_placed', handleHoldPlaced);
    window.addEventListener('socket_hold_removed', handleHoldRemoved);
    window.addEventListener('socket_hold_expired', handleHoldExpired);

    return () => {
      window.removeEventListener('socket_hold_placed', handleHoldPlaced);
      window.removeEventListener('socket_hold_removed', handleHoldRemoved);
      window.removeEventListener('socket_hold_expired', handleHoldExpired);
    };
  }, [setTrucks, onHoldExpired]);

  // This component doesn't render anything
  return null;
};

export default HoldEventHandler;
