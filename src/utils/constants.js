/**
 * Application constants and configuration
 */

// AI Model Configuration
export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Token Limits per Operation
export const TOKEN_LIMITS = {
  VALIDATE_CLASS: 50,
  GENERATE_FLASHCARDS: 2000,
  GENERATE_QUIZ: 2500,
  GENERATE_TEST: 3000,
  GRADE_TEST: 2000,
  EXTRACT_TOPIC: 30,
};

// Temperature Settings
export const TEMPERATURE = {
  LOW: 0.3,  // For validation and grading (more deterministic)
  HIGH: 0.7, // For content generation (more creative)
};

// CORS Configuration
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// File Upload Limits
export const FILE_LIMITS = {
  MAX_SIZE_BYTES: 25600,       // 25KB
  MAX_CONTEXT_CHARS: 16000,    // ~4k tokens at 4 chars/token
  ALLOWED_EXTENSIONS: ['txt', 'md', 'csv', 'js', 'py', 'html', 'json', 'xml', 'pdf'],
};

// Topic Input Limits
export const TOPIC_MAX_CHARS = 500;

// Default Values
export const DEFAULTS = {
  SESSION_ID: 'default',
  FLASHCARD_COUNT: 10,
  QUIZ_COUNT: 5,
  TEST_COUNT: 10,
};