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