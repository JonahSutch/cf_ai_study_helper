/**
 * Handler for /api/generate-quiz endpoint
 */

import { AIService } from '../services/ai-service.js';
import { StorageService } from '../services/storage-service.js';
import { validateClassName, validateCount } from '../utils/validators.js';
import { jsonResponse, errorResponse } from '../utils/response-helpers.js';
import { DEFAULTS, FILE_LIMITS } from '../utils/constants.js';

export async function handleGenerateQuiz(request, env, corsHeaders) {
  try {
    const {
      className,
      topic = '',
      fileContext = '',
      sessionId = DEFAULTS.SESSION_ID,
      count = DEFAULTS.QUIZ_COUNT,
      existingQuestions = []
    } = await request.json();

    // Validate input
    validateClassName(className);
    const validatedCount = validateCount(count, 1, 50);

    if (fileContext && fileContext.length > FILE_LIMITS.MAX_CONTEXT_CHARS) {
      return errorResponse('File content exceeds maximum allowed size', 400, corsHeaders);
    }

    // Generate quiz using AI service
    const aiService = new AIService(env);
    const quiz = await aiService.generateQuiz(className, topic, validatedCount, existingQuestions, fileContext);

    // Store in Durable Object
    const storageService = new StorageService(env);
    await storageService.saveSession(sessionId, {
      className,
      mode: 'quiz',
      topic
    });
    await storageService.saveContent(sessionId, quiz);

    return jsonResponse(quiz, 200, corsHeaders);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('empty')) {
      return errorResponse(error.message, 400, corsHeaders);
    }
    return errorResponse(error.message, 500, corsHeaders, error.message);
  }
}