/**
 * Storage Service - Wrapper for Durable Objects
 * Provides methods for session state persistence
 */

export class StorageService {
  constructor(env) {
    this.durableObject = env.CHAT_STORAGE;
  }

  /**
   * Get Durable Object stub for a session
   * @param {string} sessionId - Session ID
   * @returns {DurableObjectStub} Durable Object stub
   * @private
   */
  _getStub(sessionId) {
    const id = this.durableObject.idFromName(sessionId);
    return this.durableObject.get(id);
  }

  /**
   * Get session metadata
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session data
   */
  async getSession(sessionId) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/session');
    return response.json();
  }

  /**
   * Save session metadata (class, mode, topic)
   * @param {string} sessionId - Session ID
   * @param {Object} sessionData - Session data to save
   * @returns {Promise<Object>} Success response
   */
  async saveSession(sessionId, sessionData) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/session', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
    return response.json();
  }

  /**
   * Get stored content (flashcards, quiz, test)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Content data
   */
  async getContent(sessionId) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/content');
    return response.json();
  }

  /**
   * Save generated content
   * @param {string} sessionId - Session ID
   * @param {Object} content - Content to save
   * @returns {Promise<Object>} Success response
   */
  async saveContent(sessionId, content) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/content', {
      method: 'POST',
      body: JSON.stringify(content),
    });
    return response.json();
  }

  /**
   * Get quiz/test progress
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Progress data
   */
  async getProgress(sessionId) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/progress');
    return response.json();
  }

  /**
   * Save quiz/test progress
   * @param {string} sessionId - Session ID
   * @param {Object} progress - Progress data to save
   * @returns {Promise<Object>} Success response
   */
  async saveProgress(sessionId, progress) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/progress', {
      method: 'POST',
      body: JSON.stringify(progress),
    });
    return response.json();
  }

  /**
   * Clear all session data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Success response
   */
  async clearSession(sessionId) {
    const stub = this._getStub(sessionId);
    const response = await stub.fetch('http://internal/clear', {
      method: 'POST',
    });
    return response.json();
  }
}