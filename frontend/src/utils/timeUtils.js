/**
 * Utility functions for time handling in the active App Timezone (IANA).
 * Default fallback: America/New_York.
 */

let currentAppTimezone = 'America/New_York';

export const setAppTimezone = (tz) => {
  if (typeof tz === 'string' && tz.trim()) {
    currentAppTimezone = tz;
  }
};

export const getAppTimezone = () => currentAppTimezone;

/**
 * Gets current time in the active App Timezone, adjusted by the server offset.
 * @param {number} [serverTimeOffset=0] - The offset in milliseconds between server and client time.
 * @returns {Date} The current, server-adjusted time.
 */
export const getCurrentTimeInAppTZ = (serverTimeOffset = 0) => {
  const clientNow = new Date();
  return new Date(clientNow.getTime() + serverTimeOffset);
};

/**
 * Formats a date object or a timestamp into a time string (HH:mm:ss) in the App Timezone.
 * @param {Date|number|string} timeLike - The date or timestamp to format.
 * @returns {string} The formatted time string.
 */
export const formatTimeInAppTZ = (timeLike) => {
  const date = new Date(timeLike);
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: currentAppTimezone,
  }).format(date);
};

/**
 * Formats a date object or a timestamp into a date-time string (YYYY-MM-DD HH:mm) in the App Timezone.
 * This function avoids timezone conversion issues by using Intl.DateTimeFormat directly.
 * @param {Date|number|string} timeLike - The date or timestamp to format.
 * @returns {string} The formatted date-time string in YYYY-MM-DD HH:mm format.
 */
export const formatDateTimeInAppTZ = (timeLike) => {
  const date = new Date(timeLike);
  if (isNaN(date.getTime())) return '';
  
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: currentAppTimezone,
  }).formatToParts(date);
  
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};

/**
 * @deprecated Use `formatTimeInAppTZ` instead.
 */
export const formatEDTTime = (timeLike) => formatTimeInAppTZ(timeLike);

/**
 * @deprecated Kept for backward compatibility.
 */
export const formatEDTTimeForModal = (timeLike) => {
  if (!timeLike) return '-';
  try {
    const date = new Date(timeLike);
    if (isNaN(date.getTime())) return 'Invalid date';
    const parts = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: currentAppTimezone,
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`;
  } catch (error) {
    console.error('Error formatting time for modal:', error);
    return 'Invalid date';
  }
};

/**
 * @deprecated Kept for backward compatibility.
 */
export const formatEDTDate = (timeLike) => {
  if (!timeLike) return '-';
  try {
    const date = new Date(timeLike);
    if (isNaN(date.getTime())) return 'Invalid date';
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: currentAppTimezone,
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  } catch (error) {
    console.error('Error formatting date in App TZ:', error);
    return 'Invalid date';
  }
};

/**
 * @deprecated Kept for backward compatibility.
 */
export const formatEDTDateMobile = (timeLike) => {
  if (!timeLike) return '-';
  try {
    const date = new Date(timeLike);
    if (isNaN(date.getTime())) return 'Invalid date';
    const parts = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      timeZone: currentAppTimezone,
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('month')}.${get('day')}`;
  } catch (error) {
    console.error('Error formatting mobile date in App TZ:', error);
    return 'Invalid date';
  }
};

/**
 * @deprecated Kept for backward compatibility.
 */
export const formatEDTDateTime = (timeLike) => {
  if (!timeLike) return 'Not set';
  try {
    const date = new Date(timeLike);
    if (isNaN(date.getTime())) return 'Invalid date';
    const d = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: currentAppTimezone }).format(date);
    const t = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: currentAppTimezone }).format(date);
    return `${d} ${t}`;
  } catch (error) {
    console.error('Error formatting date time in App TZ:', error);
    return 'Invalid date';
  }
};

/**
 * @deprecated Use `getCurrentTimeInAppTZ` instead.
 */
export const getCurrentEDT = (serverTimeOffset = 0) => {
  return getCurrentTimeInAppTZ(serverTimeOffset);
};

/**
 * @deprecated No longer needed; parsing logic is more robust now.
 */
export const convertToEDT = (timeLike) => formatTimeInAppTZ(timeLike);

/**
 * @deprecated Direct UTC-to-AppTZ conversion should be handled by a robust library if needed, but client-side conversion is discouraged.
 */
export const convertUTCToEDT = (utcTime) => {
  const utcDate = new Date(utcTime);
  return new Date(utcDate.toLocaleString('en-US', { timeZone: currentAppTimezone }));
};

/**
 * @deprecated Use a more robust relative time formatting library if needed.
 */
export const getRelativeTime = (timeLike, nowOffsetMs = 0) => {
  if (!timeLike) return 'Unknown time';
  try {
    let activityMs = new Date(timeLike).getTime();
    if (isNaN(activityMs)) return 'Invalid time';
    const nowMs = Date.now() + nowOffsetMs;
    const diffMs = nowMs - activityMs;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch (error) {
    console.error('Error calculating relative time:', error);
    return 'Time error';
  }
};

/**
 * Parses a date/time string into a `Date` object.
 * This function is simplified and assumes the input string is in a format that `new Date()` can parse correctly.
 * For robust applications, a dedicated date-parsing library is recommended.
 * @param {string|number} timeLike - The date string or timestamp.
 * @returns {number} The epoch milliseconds.
 */
export const parseAppTzDateTimeToEpochMs = (timeLike) => {
  if (!timeLike) return NaN;
  const date = new Date(timeLike);
  return isNaN(date.getTime()) ? NaN : date.getTime();
};

/**
 * @deprecated Validation logic is complex and should be handled with care, potentially with a dedicated library.
 */
export const validateEDTDate = (timeLike, maxDaysPast = 30, maxDaysFuture = 365, serverTimeOffset = 0) => {
  if (!timeLike) return { isValid: false, error: 'Date is required' };
  try {
    const date = new Date(timeLike);
    if (isNaN(date.getTime())) return { isValid: false, error: 'Invalid date format' };
    const now = getCurrentTimeInAppTZ(serverTimeOffset);
    const pastLimit = new Date(now.getTime() - maxDaysPast * 86400000);
    const futureLimit = new Date(now.getTime() + maxDaysFuture * 86400000);
    if (date < pastLimit) return { isValid: false, error: `Date cannot be more than ${maxDaysPast} days in the past` };
    if (date > futureLimit) return { isValid: false, error: `Date cannot be more than ${maxDaysFuture} days in the future` };
    return { isValid: true, error: null };
  } catch (error) {
    console.error('Error validating date:', error);
    return { isValid: false, error: 'Date validation error' };
  }
}; 