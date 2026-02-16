/**
 * Handler for /api/extract-topic endpoint
 */

import { AIService } from '../services/ai-service.js';
import { jsonResponse, errorResponse } from '../utils/response-helpers.js';
import { FILE_LIMITS } from '../utils/constants.js';

export async function handleExtractTopic(request, env, corsHeaders) {
  try {
    const { fileContent } = await request.json();

    if (!fileContent || typeof fileContent !== 'string') {
      return errorResponse('fileContent is required', 400, corsHeaders);
    }

    if (fileContent.length > FILE_LIMITS.MAX_CONTEXT_CHARS) {
      return errorResponse('File content too large', 400, corsHeaders);
    }

    const aiService = new AIService(env);
    const topic = await aiService.extractTopicFromFile(fileContent);

    return jsonResponse({ topic }, 200, corsHeaders);
  } catch (error) {
    return errorResponse('Failed to extract topic: ' + error.message, 500, corsHeaders);
  }
}
