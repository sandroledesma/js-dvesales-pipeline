/**
 * Convert a date to ISO string
 * @param {Date} d - Date object
 * @returns {string} ISO 8601 formatted string
 */
function isoString(d) {
  return d.toISOString();
}

/**
 * Get the start of day (00:00:00.000)
 * @param {Date} d - Date object
 * @returns {Date} New Date object set to start of day
 */
function startOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get the end of day (23:59:59.999)
 * @param {Date} d - Date object
 * @returns {Date} New Date object set to end of day
 */
function endOfDay(d) {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Get a time window going back N days from now
 * @param {number} days - Number of days to go back
 * @returns {Object} Object with startISO and endISO strings
 */
function windowDaysBack(days) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);

  return {
    startISO: isoString(startOfDay(start)),
    endISO: isoString(endOfDay(now)),
  };
}

module.exports = {
  isoString,
  startOfDay,
  endOfDay,
  windowDaysBack,
};
