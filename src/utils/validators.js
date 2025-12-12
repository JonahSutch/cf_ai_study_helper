/**
 * Input validation utilities
 */

/**
 * Validate class name input
 * @param {string} className - Class name to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateClassName(className) {
  if (!className || typeof className !== 'string') {
    throw new Error('Class name is required');
  }

  if (className.trim().length === 0) {
    throw new Error('Class name cannot be empty');
  }

  return true;
}

/**
 * Validate session ID
 * @param {string} sessionId - Session ID to validate
 * @returns {boolean} True if valid
 */
export function validateSessionId(sessionId) {
  return sessionId && typeof sessionId === 'string' && sessionId.length > 0;
}

/**
 * Validate count parameter (for question/card counts)
 * @param {number} count - Count to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Validated count
 */
export function validateCount(count, min = 1, max = 50) {
  const num = parseInt(count, 10);

  if (isNaN(num)) {
    return min;
  }

  if (num < min) {
    return min;
  }

  if (num > max) {
    return max;
  }

  return num;
}

/**
 * Validate answers array
 * @param {Array} answers - Answers array to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateAnswers(answers) {
  if (!answers || !Array.isArray(answers)) {
    throw new Error('Answers array is required');
  }

  if (answers.length === 0) {
    throw new Error('Answers array cannot be empty');
  }

  return true;
}