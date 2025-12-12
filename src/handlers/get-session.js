/**
 * Handler for /api/session endpoint (GET)
 */

import { StorageService } from '../services/storage-service.js';
import { jsonResponse } from '../utils/response-helpers.js';
import { DEFAULTS } from '../utils/constants.js';

export async function handleGetSession(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId') || DEFAULTS.SESSION_ID;

  const storageService = new StorageService(env);
  const session = await storageService.getSession(sessionId);

  return jsonResponse(session, 200, corsHeaders);
}