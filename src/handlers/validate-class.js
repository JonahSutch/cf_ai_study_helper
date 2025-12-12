/**
 * Handler for /api/validate-class endpoint
 */

import { AIService } from '../services/ai-service.js';
import { validateClassName } from '../utils/validators.js';
import { jsonResponse, errorResponse } from '../utils/response-helpers.js';

export async function handleValidateClass(request, env, corsHeaders) {
  try {
    const { className } = await request.json();

    // Validate input
    validateClassName(className);

    // Use AI service to validate
    const aiService = new AIService(env);
    const result = await aiService.validateClass(className);

    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('empty')) {
      return errorResponse(error.message, 400, corsHeaders);
    }
    return errorResponse('Error validating class: ' + error.message, 500, corsHeaders);
  }
}