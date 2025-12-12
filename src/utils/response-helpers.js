/**
 * HTTP response helper functions
 */

import { CORS_HEADERS } from './constants.js';

/**
 * Create a JSON response with CORS headers
 * @param {Object} data - Data to return in response
 * @param {number} status - HTTP status code (default: 200)
 * @param {Object} corsHeaders - CORS headers (optional, uses defaults)
 * @returns {Response} HTTP Response object
 */
export function jsonResponse(data, status = 200, corsHeaders = CORS_HEADERS) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Create an error response with consistent format
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default: 500)
 * @param {Object} corsHeaders - CORS headers (optional, uses defaults)
 * @param {string} details - Additional error details (optional)
 * @returns {Response} HTTP Response object
 */
export function errorResponse(message, status = 500, corsHeaders = CORS_HEADERS, details = null) {
  const errorData = { error: message };
  if (details) {
    errorData.details = details;
  }

  return new Response(JSON.stringify(errorData), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}