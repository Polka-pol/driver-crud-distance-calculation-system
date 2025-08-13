/**
 * Utility functions for time handling in Eastern Daylight Time (EDT)
 * Server now provides time directly in EDT, so no conversion needed
 */

/**
 * Formats EDT time for display
 * @param {Date|string} edtTime - EDT time from server
 * @returns {string} Formatted time string (HH:MM:SS)
 */
export const formatEDTTime = (edtTime) => {
  const date = new Date(edtTime);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

/**
 * Formats EDT time for EditModal display (MM.DD HH:MM)
 * @param {Date|string} edtTime - EDT time from server
 * @returns {string} Formatted time string in MM.DD HH:MM format
 */
export const formatEDTTimeForModal = (edtTime) => {
  if (!edtTime) return '-';
  
  try {
    const date = new Date(edtTime);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    
    return `${mm}.${dd} ${hh}:${min}`;
  } catch (error) {
    console.error('Error formatting EDT time for modal:', error);
    return 'Invalid date';
  }
};

/**
 * Formats EDT date for display (YYYY-MM-DD HH:MM)
 * @param {Date|string} edtTime - EDT time from server
 * @returns {string} Formatted date string
 */
export const formatEDTDate = (edtTime) => {
  if (!edtTime) return '-';
  
  try {
    const date = new Date(edtTime);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch (error) {
    console.error('Error formatting EDT date:', error);
    return 'Invalid date';
  }
};

/**
 * Formats EDT date for mobile display (MM.DD)
 * @param {Date|string} edtTime - EDT time from server
 * @returns {string} Formatted mobile date string
 */
export const formatEDTDateMobile = (edtTime) => {
  if (!edtTime) return '-';
  
  try {
    const date = new Date(edtTime);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    return `${mm}.${dd}`;
  } catch (error) {
    console.error('Error formatting EDT mobile date:', error);
    return 'Invalid date';
  }
};

/**
 * Formats EDT time for display with date and time
 * @param {Date|string} edtTime - EDT time from server
 * @returns {string} Formatted date and time string
 */
export const formatEDTDateTime = (edtTime) => {
  if (!edtTime) return 'Not set';
  
  try {
    const date = new Date(edtTime);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit', 
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting EDT date time:', error);
    return 'Invalid date';
  }
};

/**
 * Gets current time in EDT timezone
 * Since server now provides time directly in EDT, we use server time for hold calculations
 * @param {number} serverTimeOffset - Not used anymore, kept for compatibility
 * @returns {Date} Current time in EDT timezone
 */
export const getCurrentEDT = (serverTimeOffset = 0) => {
  // For client-side display, use browser's EDT time
  const now = new Date();
  return new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
};

/**
 * Converts server EDT time to display format
 * @param {string|Date} serverEDTTime - EDT time from server
 * @returns {string} Formatted EDT time for display
 */
export const convertToEDT = (serverEDTTime) => {
  // Server now provides EDT time directly, just format it
  return formatEDTTime(serverEDTTime);
};

/**
 * Converts UTC time to EDT (for legacy compatibility)
 * @param {string|Date} utcTime - UTC time string or Date object
 * @returns {Date} Time in EDT
 */
export const convertUTCToEDT = (utcTime) => {
  const utcDate = new Date(utcTime);
  return new Date(utcDate.toLocaleString("en-US", {timeZone: "America/New_York"}));
};

/**
 * Calculates relative time from EDT time
 * @param {string|Date} edtTime - EDT time from server
 * @returns {string} Relative time string (e.g., "2h ago", "Just now")
 */
export const getRelativeTime = (edtTime) => {
  if (!edtTime) return 'Unknown time';
  
  try {
    const currentEDT = getCurrentEDT();
    const activityEDT = new Date(edtTime);
    
    if (isNaN(activityEDT.getTime())) return 'Invalid time';
    
    const diffMs = currentEDT - activityEDT;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMs < 0) return 'Future time';
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch (error) {
    console.error('Error calculating relative time:', error);
    return 'Time error';
  }
};

/**
 * Validates EDT date with proper timezone handling
 * @param {string|Date} edtTime - EDT time to validate
 * @param {number} maxDaysPast - Maximum days in past (default: 30)
 * @param {number} maxDaysFuture - Maximum days in future (default: 365)
 * @returns {Object} Validation result with isValid and error message
 */
export const validateEDTDate = (edtTime, maxDaysPast = 30, maxDaysFuture = 365) => {
  if (!edtTime) {
    return { isValid: false, error: 'Date is required' };
  }
  
  try {
    const date = new Date(edtTime);
    if (isNaN(date.getTime())) {
      return { isValid: false, error: 'Invalid date format' };
    }
    
    const currentEDT = getCurrentEDT();
    const pastLimit = new Date(currentEDT);
    pastLimit.setDate(pastLimit.getDate() - maxDaysPast);
    
    const futureLimit = new Date(currentEDT);
    futureLimit.setDate(futureLimit.getDate() + maxDaysFuture);
    
    if (date < pastLimit) {
      return { isValid: false, error: `Date cannot be more than ${maxDaysPast} days in the past` };
    }
    
    if (date > futureLimit) {
      return { isValid: false, error: `Date cannot be more than ${maxDaysFuture} days in the future` };
    }
    
    return { isValid: true, error: null };
  } catch (error) {
    console.error('Error validating EDT date:', error);
    return { isValid: false, error: 'Date validation error' };
  }
}; 