/**
 * Handler for /api/grade-test endpoint
 */

import { AIService } from '../services/ai-service.js';
import { StorageService } from '../services/storage-service.js';
import { validateAnswers } from '../utils/validators.js';
import { jsonResponse, errorResponse } from '../utils/response-helpers.js';
import { DEFAULTS } from '../utils/constants.js';

export async function handleGradeTest(request, env, corsHeaders) {
  try {
    const { answers, sessionId = DEFAULTS.SESSION_ID } = await request.json();

    // Validate input
    validateAnswers(answers);

    // Get test content from Durable Object
    const storageService = new StorageService(env);
    const content = await storageService.getContent(sessionId);

    if (!content || !content.questions) {
      return errorResponse('No test found for this session', 400, corsHeaders);
    }

    // Grade test using AI service
    const aiService = new AIService(env);
    const grading = await aiService.gradeTest(content.questions, answers);

    // Store grading results
    await storageService.saveProgress(sessionId, grading);

    return jsonResponse(grading, 200, corsHeaders);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('empty')) {
      return errorResponse(error.message, 400, corsHeaders);
    }
    return errorResponse(error.message, 500, corsHeaders, error.message);
  }
}