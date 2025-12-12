/**
 * Handler for /api/generate-flashcards endpoint
 */

import { AIService } from '../services/ai-service.js';
import { StorageService } from '../services/storage-service.js';
import { validateClassName, validateCount } from '../utils/validators.js';
import { jsonResponse, errorResponse } from '../utils/response-helpers.js';
import { DEFAULTS } from '../utils/constants.js';

export async function handleGenerateFlashcards(request, env, corsHeaders) {
  try {
    const {
      className,
      topic = '',
      sessionId = DEFAULTS.SESSION_ID,
      count = DEFAULTS.FLASHCARD_COUNT
    } = await request.json();

    // Validate input
    validateClassName(className);
    const validatedCount = validateCount(count, 1, 50);

    // Generate flashcards using AI service
    const aiService = new AIService(env);
    const flashcards = await aiService.generateFlashcards(className, topic, validatedCount);

    // Store in Durable Object
    const storageService = new StorageService(env);
    await storageService.saveSession(sessionId, {
      className,
      mode: 'flashcards',
      topic
    });
    await storageService.saveContent(sessionId, flashcards);

    return jsonResponse(flashcards, 200, corsHeaders);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('empty')) {
      return errorResponse(error.message, 400, corsHeaders);
    }
    return errorResponse(error.message, 500, corsHeaders, error.message);
  }
}