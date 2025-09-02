/**
 * Utility functions for hold system
 */

/**
 * Check if phone numbers should be hidden based on hold status
 * @param {Object} truck - Truck object with hold information
 * @param {number|string} currentUserId - Current user ID
 * @returns {boolean} - True if phones should be hidden
 */
export const shouldHidePhoneNumbers = (truck, currentUserId) => {
  if (!truck || !truck.hold_status || truck.hold_status !== 'active') {
    return false;
  }
  
  // Convert both to strings for comparison to avoid type issues
  const holdDispatcherId = String(truck.hold_dispatcher_id);
  const currentUserIdStr = String(currentUserId);
  
  // Hide phones if truck is on hold by another dispatcher
  const shouldHide = holdDispatcherId !== currentUserIdStr;
  
  // Debug logging
  console.log('Hold check:', {
    truckId: truck.id,
    holdStatus: truck.hold_status,
    holdDispatcherId,
    currentUserIdStr,
    shouldHide
  });
  
  return shouldHide;
};

/**
 * Get display value for phone number (hide if needed)
 * @param {string} phoneNumber - Original phone number
 * @param {Object} truck - Truck object with hold information
 * @param {number|string} currentUserId - Current user ID
 * @returns {string} - Phone number or '***' if hidden
 */
export const getDisplayPhoneNumber = (phoneNumber, truck, currentUserId) => {
  if (shouldHidePhoneNumbers(truck, currentUserId)) {
    return '***';
  }
  return phoneNumber || '';
};

/**
 * Check if current user can remove hold
 * @param {Object} truck - Truck object with hold information
 * @param {number|string} currentUserId - Current user ID
 * @returns {boolean} - True if user can remove hold
 */
export const canRemoveHold = (truck, currentUserId) => {
  if (!truck || truck.hold_status !== 'active') {
    return false;
  }
  
  // Convert both to strings for comparison to avoid type issues
  const holdDispatcherId = String(truck.hold_dispatcher_id);
  const currentUserIdStr = String(currentUserId);
  
  return holdDispatcherId === currentUserIdStr;
};
