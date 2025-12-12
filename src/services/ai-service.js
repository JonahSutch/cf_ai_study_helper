/**
 * AI Service - Wrapper for Cloudflare Workers AI
 * Provides methods for all AI-related operations
 */

import { AI_MODEL, TOKEN_LIMITS, TEMPERATURE } from '../utils/constants.js';
import { parseAIResponse } from '../utils/json-parser.js';

export class AIService {
  constructor(env) {
    this.ai = env.AI;
  }

  /**
   * Validate if a class name represents a valid academic subject
   * @param {string} className - Class name to validate
   * @returns {Promise<Object>} { valid: boolean, message: string }
   */
  async validateClass(className) {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful educational assistant. Your task is to determine if the given text represents a valid academic subject, class, or topic that someone could study. Respond with ONLY "VALID" if it is a real academic subject, or "INVALID: [brief reason]" if it is not.',
      },
      {
        role: 'user',
        content: `Is "${className}" a valid academic subject or class? Respond with ONLY "VALID" or "INVALID: [reason]"`,
      },
    ];

    const response = await this.ai.run(AI_MODEL, {
      messages,
      max_tokens: TOKEN_LIMITS.VALIDATE_CLASS,
      temperature: TEMPERATURE.LOW,
    });

    const result = response.response.trim();
    const isValid = result.toUpperCase().startsWith('VALID');

    return {
      valid: isValid,
      message: isValid ? 'Valid class!' : result,
    };
  }

  /**
   * Generate flashcards for studying
   * @param {string} className - Class name
   * @param {string} topic - Specific topic (optional)
   * @param {number} count - Number of flashcards to generate
   * @returns {Promise<Object>} { flashcards: Array }
   */
  async generateFlashcards(className, topic = '', count = 10) {
    const messages = [
      {
        role: 'system',
        content: 'You are an expert educational content creator. Generate high-quality flashcards for studying. Return ONLY valid JSON in this exact format: {"flashcards": [{"question": "...", "answer": "..."}]}',
      },
      {
        role: 'user',
        content: `Create ${count} flashcards for ${className}${topic ? ` focusing on ${topic}` : ''}. Each flashcard should have a clear question and a concise answer. Return ONLY the JSON format specified.`,
      },
    ];

    const response = await this.ai.run(AI_MODEL, {
      messages,
      max_tokens: TOKEN_LIMITS.GENERATE_FLASHCARDS,
      temperature: TEMPERATURE.HIGH,
    });

    try {
      return parseAIResponse(response, { flashcards: 'array' });
    } catch (error) {
      console.error('JSON Parse Error:', error.message, 'Response:', response.response);
      throw new Error('Failed to generate flashcards. Please try again.');
    }
  }

  /**
   * Generate multiple choice quiz
   * @param {string} className - Class name
   * @param {string} topic - Specific topic (optional)
   * @param {number} count - Number of questions to generate
   * @returns {Promise<Object>} { questions: Array }
   */
  async generateQuiz(className, topic = '', count = 5) {
    const messages = [
      {
        role: 'system',
        content: 'You are an expert quiz creator. Generate multiple choice questions with hints. Return ONLY valid JSON in this exact format: {"questions": [{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": 0, "hint": "...", "explanation": "..."}]}. The "correct" field should be the index (0-3) of the correct answer.',
      },
      {
        role: 'user',
        content: `Create ${count} multiple choice questions for ${className}${topic ? ` focusing on ${topic}` : ''}. Each question should have 4 options (A-D), indicate which is correct, include a helpful hint, and provide an explanation. Return ONLY the JSON format specified.`,
      },
    ];

    const response = await this.ai.run(AI_MODEL, {
      messages,
      max_tokens: TOKEN_LIMITS.GENERATE_QUIZ,
      temperature: TEMPERATURE.HIGH,
    });

    try {
      return parseAIResponse(response, { questions: 'array' });
    } catch (error) {
      console.error('JSON Parse Error:', error.message, 'Response:', response.response);
      throw new Error('Failed to generate quiz. Please try again.');
    }
  }

  /**
   * Generate comprehensive test
   * @param {string} className - Class name
   * @param {string} topic - Specific topic (optional)
   * @param {number} count - Number of questions to generate
   * @returns {Promise<Object>} { questions: Array }
   */
  async generateTest(className, topic = '', count = 10) {
    const messages = [
      {
        role: 'system',
        content: 'You are an expert test creator. Generate comprehensive test questions. Return ONLY valid JSON in this exact format: {"questions": [{"question": "...", "type": "short_answer", "correctAnswer": "...", "points": 10}]}. Mix of question types allowed: "multiple_choice" (with "options" array) or "short_answer".',
      },
      {
        role: 'user',
        content: `Create ${count} test questions for ${className}${topic ? ` focusing on ${topic}` : ''}. Include a mix of multiple choice and short answer questions. Each question should have a point value and correct answer. Return ONLY the JSON format specified.`,
      },
    ];

    const response = await this.ai.run(AI_MODEL, {
      messages,
      max_tokens: TOKEN_LIMITS.GENERATE_TEST,
      temperature: TEMPERATURE.HIGH,
    });

    try {
      return parseAIResponse(response, { questions: 'array' });
    } catch (error) {
      console.error('JSON Parse Error:', error.message, 'Response:', response.response);
      throw new Error('Failed to generate test. Please try again.');
    }
  }

  /**
   * Grade a submitted test
   * @param {Array} questions - Original test questions
   * @param {Array} answers - Student answers
   * @returns {Promise<Object>} { results: Array, totalScore: number, totalPossible: number }
   */
  async gradeTest(questions, answers) {
    // Build grading prompt
    const questionsAndAnswers = questions.map((q, i) => ({
      question: q.question,
      correctAnswer: q.correctAnswer,
      studentAnswer: answers[i],
      points: q.points || 10,
    }));

    const messages = [
      {
        role: 'system',
        content: 'You are an expert grader. Grade each answer and provide feedback. Return ONLY valid JSON in this format: {"results": [{"questionIndex": 0, "pointsEarned": 10, "pointsPossible": 10, "feedback": "..."}], "totalScore": 100, "totalPossible": 100}',
      },
      {
        role: 'user',
        content: `Grade these test answers:\n\n${JSON.stringify(questionsAndAnswers, null, 2)}\n\nProvide fair grading with constructive feedback. Return ONLY the JSON format specified.`,
      },
    ];

    const response = await this.ai.run(AI_MODEL, {
      messages,
      max_tokens: TOKEN_LIMITS.GRADE_TEST,
      temperature: TEMPERATURE.LOW,
    });

    try {
      return parseAIResponse(response, { results: 'array' });
    } catch (error) {
      console.error('JSON Parse Error:', error.message, 'Response:', response.response);
      throw new Error('Failed to grade test. Please try again.');
    }
  }
}