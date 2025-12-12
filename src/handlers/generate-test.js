/**
 * Handler for /api/generate-test endpoint
 */

import { AIService } from '../services/ai-service.js';
import { StorageService } from '../services/storage-service.js';
import { validateClassName, validateCount } from '../utils/validators.js';
import { jsonResponse, errorResponse } from '../utils/response-helpers.js';
import { DEFAULTS } from '../utils/constants.js';

export async function handleGenerateTest(request, env, corsHeaders) {
  try {
    const {
      className,
      topic = '',
      sessionId = DEFAULTS.SESSION_ID,
      count = DEFAULTS.TEST_COUNT
    } = await request.json();

    // Validate input
    validateClassName(className);
    const validatedCount = validateCount(count, 1, 50);

    // Generate test using AI service
    const aiService = new AIService(env);
    const test = await aiService.generateTest(className, topic, validatedCount);

    // Store in Durable Object
    const storageService = new StorageService(env);
    await storageService.saveSession(sessionId, {
      className,
      mode: 'test',
      topic
    });
    await storageService.saveContent(sessionId, test);

    return jsonResponse(test, 200, corsHeaders);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('empty')) {
      return errorResponse(error.message, 400, corsHeaders);
    }
    return errorResponse(error.message, 500, corsHeaders, error.message);
  }
}