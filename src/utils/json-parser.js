/**
 * Utility functions for parsing AI responses
 */

/**
 * Parse JSON from AI response, handling both object and string formats
 * @param {Object} response - The AI response object
 * @param {Object} expectedStructure - Expected structure validation (e.g., { flashcards: 'array' })
 * @returns {Object} Parsed JSON object
 * @throws {Error} If parsing fails or structure is invalid
 */
export function parseAIResponse(response, expectedStructure = {}) {
  const responseData = response.response;

  let parsedData;

  // Check if response is already an object
  if (typeof responseData === 'object' && responseData !== null) {
    parsedData = responseData;
  } else if (typeof responseData === 'string') {
    // If it's a string, try to parse JSON from it
    const responseText = responseData.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } else {
    throw new Error('Unexpected response format');
  }

  // Validate expected structure
  for (const [key, expectedType] of Object.entries(expectedStructure)) {
    if (!(key in parsedData)) {
      throw new Error(`Missing expected field: ${key}`);
    }

    if (expectedType === 'array' && !Array.isArray(parsedData[key])) {
      throw new Error(`Field '${key}' should be an array`);
    }

    if (expectedType === 'object' && typeof parsedData[key] !== 'object') {
      throw new Error(`Field '${key}' should be an object`);
    }
  }

  return parsedData;
}