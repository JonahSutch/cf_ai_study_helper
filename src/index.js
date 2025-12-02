/**
 * Main Worker entry point
 * Handles routing and orchestrates the study helper application
 */

// Import the Durable Object
export { ChatStorage } from './chatStorage.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Serve frontend
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(HTML_CONTENT, {
          headers: { 'Content-Type': 'text/html', ...corsHeaders },
        });
      }

      // API endpoint to validate class
      if (url.pathname === '/api/validate-class' && request.method === 'POST') {
        return handleValidateClass(request, env, corsHeaders);
      }

      // API endpoint to generate flashcards
      if (url.pathname === '/api/generate-flashcards' && request.method === 'POST') {
        return handleGenerateFlashcards(request, env, corsHeaders);
      }

      // API endpoint to generate quiz
      if (url.pathname === '/api/generate-quiz' && request.method === 'POST') {
        return handleGenerateQuiz(request, env, corsHeaders);
      }

      // API endpoint to generate test
      if (url.pathname === '/api/generate-test' && request.method === 'POST') {
        return handleGenerateTest(request, env, corsHeaders);
      }

      // API endpoint to grade test
      if (url.pathname === '/api/grade-test' && request.method === 'POST') {
        return handleGradeTest(request, env, corsHeaders);
      }

      // API endpoint to get session data
      if (url.pathname === '/api/session' && request.method === 'GET') {
        return handleGetSession(request, env, corsHeaders);
      }

      // 404 for other routes
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

/**
 * Validate if a class/subject is valid
 */
async function handleValidateClass(request, env, corsHeaders) {
  const { className } = await request.json();

  if (!className) {
    return new Response(JSON.stringify({ error: 'Class name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 50,
    temperature: 0.3,
  });

  const result = response.response.trim();
  const isValid = result.toUpperCase().startsWith('VALID');

  return new Response(
    JSON.stringify({
      valid: isValid,
      message: isValid ? 'Valid class!' : result,
    }),
    {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
}

/**
 * Generate flashcards for a subject
 */
async function handleGenerateFlashcards(request, env, corsHeaders) {
  const { className, topic, sessionId = 'default', count = 10 } = await request.json();

  if (!className) {
    return new Response(JSON.stringify({ error: 'Class name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 2000,
    temperature: 0.7,
  });

  // Parse JSON from response
  let flashcards;
  try {
    const responseData = response.response;

    // Check if response is already an object
    if (typeof responseData === 'object' && responseData !== null) {
      flashcards = responseData;
    } else if (typeof responseData === 'string') {
      // If it's a string, try to parse JSON from it
      const responseText = responseData.trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        flashcards = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } else {
      throw new Error('Unexpected response format');
    }

    // Validate the structure
    if (!flashcards.flashcards || !Array.isArray(flashcards.flashcards)) {
      throw new Error('Invalid flashcard structure');
    }
  } catch (error) {
    console.error('JSON Parse Error:', error.message, 'Response:', response.response);
    return new Response(JSON.stringify({
      error: 'Failed to generate flashcards. Please try again.',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Store in Durable Object
  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);
  await stub.fetch('http://internal/session', {
    method: 'POST',
    body: JSON.stringify({ className, mode: 'flashcards', topic }),
  });
  await stub.fetch('http://internal/content', {
    method: 'POST',
    body: JSON.stringify(flashcards),
  });

  return new Response(JSON.stringify(flashcards), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Generate multiple choice quiz
 */
async function handleGenerateQuiz(request, env, corsHeaders) {
  const { className, topic, sessionId = 'default', count = 5 } = await request.json();

  if (!className) {
    return new Response(JSON.stringify({ error: 'Class name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 2500,
    temperature: 0.7,
  });

  // Parse JSON from response
  let quiz;
  try {
    const responseData = response.response;

    // Check if response is already an object
    if (typeof responseData === 'object' && responseData !== null) {
      quiz = responseData;
    } else if (typeof responseData === 'string') {
      const responseText = responseData.trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        quiz = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } else {
      throw new Error('Unexpected response format');
    }

    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      throw new Error('Invalid quiz structure');
    }
  } catch (error) {
    console.error('JSON Parse Error:', error.message, 'Response:', response.response);
    return new Response(JSON.stringify({
      error: 'Failed to generate quiz. Please try again.',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Store in Durable Object
  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);
  await stub.fetch('http://internal/session', {
    method: 'POST',
    body: JSON.stringify({ className, mode: 'quiz', topic }),
  });
  await stub.fetch('http://internal/content', {
    method: 'POST',
    body: JSON.stringify(quiz),
  });

  return new Response(JSON.stringify(quiz), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Generate graded test
 */
async function handleGenerateTest(request, env, corsHeaders) {
  const { className, topic, sessionId = 'default', count = 10 } = await request.json();

  if (!className) {
    return new Response(JSON.stringify({ error: 'Class name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 3000,
    temperature: 0.7,
  });

  // Parse JSON from response
  let test;
  try {
    const responseData = response.response;

    // Check if response is already an object
    if (typeof responseData === 'object' && responseData !== null) {
      test = responseData;
    } else if (typeof responseData === 'string') {
      const responseText = responseData.trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        test = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } else {
      throw new Error('Unexpected response format');
    }

    if (!test.questions || !Array.isArray(test.questions)) {
      throw new Error('Invalid test structure');
    }
  } catch (error) {
    console.error('JSON Parse Error:', error.message, 'Response:', response.response);
    return new Response(JSON.stringify({
      error: 'Failed to generate test. Please try again.',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Store in Durable Object
  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);
  await stub.fetch('http://internal/session', {
    method: 'POST',
    body: JSON.stringify({ className, mode: 'test', topic }),
  });
  await stub.fetch('http://internal/content', {
    method: 'POST',
    body: JSON.stringify(test),
  });

  return new Response(JSON.stringify(test), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Grade a submitted test
 */
async function handleGradeTest(request, env, corsHeaders) {
  const { answers, sessionId = 'default' } = await request.json();

  if (!answers || !Array.isArray(answers)) {
    return new Response(JSON.stringify({ error: 'Answers array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Get test content from Durable Object
  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);
  const content = await stub.fetch('http://internal/content').then(r => r.json());

  if (!content || !content.questions) {
    return new Response(JSON.stringify({ error: 'No test found for this session' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Build grading prompt
  const questionsAndAnswers = content.questions.map((q, i) => ({
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

  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 2000,
    temperature: 0.3,
  });

  // Parse JSON from response
  let grading;
  try {
    const responseData = response.response;

    // Check if response is already an object
    if (typeof responseData === 'object' && responseData !== null) {
      grading = responseData;
    } else if (typeof responseData === 'string') {
      const responseText = responseData.trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        grading = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } else {
      throw new Error('Unexpected response format');
    }

    if (!grading.results || !Array.isArray(grading.results)) {
      throw new Error('Invalid grading structure');
    }
  } catch (error) {
    console.error('JSON Parse Error:', error.message, 'Response:', response.response);
    return new Response(JSON.stringify({
      error: 'Failed to grade test. Please try again.',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Store grading results
  await stub.fetch('http://internal/progress', {
    method: 'POST',
    body: JSON.stringify(grading),
  });

  return new Response(JSON.stringify(grading), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Get session data
 */
async function handleGetSession(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId') || 'default';

  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);

  const session = await stub.fetch('http://internal/session').then(r => r.json());

  return new Response(JSON.stringify(session), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Inline HTML for the study helper interface
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Study Helper</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 100%;
      max-width: 900px;
      min-height: 600px;
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }

    .header p {
      font-size: 16px;
      opacity: 0.9;
    }

    .content {
      padding: 40px;
    }

    .step {
      display: none;
    }

    .step.active {
      display: block;
      animation: fadeIn 0.4s ease-in;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
      color: #374151;
      font-size: 14px;
    }

    input[type="text"],
    input[type="number"],
    select {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    select:focus {
      outline: none;
      border-color: #667eea;
    }

    .btn {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.2s;
      display: inline-block;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .btn-secondary {
      background: #6b7280;
      margin-right: 10px;
    }

    .mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .mode-card {
      border: 3px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .mode-card:hover {
      border-color: #667eea;
      transform: translateY(-4px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }

    .mode-card.selected {
      border-color: #667eea;
      background: #f0f4ff;
    }

    .mode-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .mode-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1f2937;
    }

    .mode-desc {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.5;
    }

    .error {
      background: #fee;
      border: 1px solid #fcc;
      color: #c33;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .success {
      background: #efe;
      border: 1px solid #cfc;
      color: #3c3;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .loading {
      text-align: center;
      padding: 40px;
    }

    .spinner {
      border: 4px solid #f3f4f6;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .flashcard {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 40px;
      margin-bottom: 20px;
      min-height: 200px;
      cursor: pointer;
      transition: transform 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 18px;
      line-height: 1.6;
      position: relative;
    }

    .flashcard:hover {
      transform: scale(1.02);
    }

    .flashcard.flipped {
      background: #f0f4ff;
      border-color: #667eea;
    }

    .flashcard-label {
      position: absolute;
      top: 12px;
      right: 12px;
      font-size: 12px;
      font-weight: 600;
      color: #667eea;
      text-transform: uppercase;
    }

    .flashcard-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
    }

    .quiz-question {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
    }

    .question-number {
      font-size: 14px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 12px;
    }

    .question-text {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #1f2937;
    }

    .options {
      margin-bottom: 16px;
    }

    .option {
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .option:hover {
      border-color: #667eea;
      background: #f0f4ff;
    }

    .option.selected {
      border-color: #667eea;
      background: #f0f4ff;
    }

    .option.correct {
      border-color: #10b981;
      background: #d1fae5;
    }

    .option.incorrect {
      border-color: #ef4444;
      background: #fee2e2;
    }

    .hint-toggle {
      color: #667eea;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      margin-top: 12px;
      display: inline-block;
    }

    .hint-content {
      display: none;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
      font-size: 14px;
      line-height: 1.5;
    }

    .hint-content.show {
      display: block;
    }

    .explanation {
      background: #f0f4ff;
      border: 1px solid #667eea;
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
      font-size: 14px;
      line-height: 1.5;
    }

    .test-results {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 30px;
      margin-top: 20px;
    }

    .score-header {
      text-align: center;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px;
      margin-bottom: 30px;
    }

    .score-value {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .result-item {
      border-bottom: 1px solid #e5e7eb;
      padding: 20px 0;
    }

    .result-item:last-child {
      border-bottom: none;
    }

    .test-question {
      margin-bottom: 20px;
    }

    .test-input {
      width: 100%;
      padding: 10px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      margin-top: 8px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 AI Study Helper</h1>
      <p>Powered by Cloudflare Workers AI</p>
    </div>

    <div class="content">
      <!-- Step 1: Enter Class -->
      <div id="step1" class="step active">
        <h2 style="margin-bottom: 20px; color: #1f2937;">What class are you studying for?</h2>
        <div id="errorMessage"></div>
        <div class="form-group">
          <label for="className">Class or Subject Name</label>
          <input type="text" id="className" placeholder="e.g., Biology 101, World History, Calculus" />
        </div>
        <div class="form-group">
          <label for="topic">Specific Topic (Optional)</label>
          <input type="text" id="topic" placeholder="e.g., Cell Structure, World War II, Derivatives" />
        </div>
        <button class="btn" onclick="validateClass()">Continue</button>
      </div>

      <!-- Step 2: Select Study Mode -->
      <div id="step2" class="step">
        <h2 style="margin-bottom: 20px; color: #1f2937;">Choose your study mode</h2>
        <div class="mode-grid">
          <div class="mode-card" onclick="selectMode('flashcards')">
            <div class="mode-icon">📚</div>
            <div class="mode-title">Flashcards</div>
            <div class="mode-desc">Generate interactive flashcards to review key concepts</div>
          </div>
          <div class="mode-card" onclick="selectMode('quiz')">
            <div class="mode-icon">🎯</div>
            <div class="mode-title">Practice Quiz</div>
            <div class="mode-desc">Multiple choice questions with hints and explanations</div>
          </div>
          <div class="mode-card" onclick="selectMode('test')">
            <div class="mode-icon">✅</div>
            <div class="mode-title">Graded Test</div>
            <div class="mode-desc">Take a comprehensive test with AI grading</div>
          </div>
        </div>
        <div style="margin-top: 30px;">
          <button class="btn btn-secondary" onclick="goToStep(1)">Back</button>
        </div>
      </div>

      <!-- Step 3: Content Display -->
      <div id="step3" class="step">
        <div id="contentArea"></div>
      </div>
    </div>
  </div>

  <script>
    let sessionId = 'session_' + Date.now();
    let currentClass = '';
    let currentTopic = '';
    let currentMode = '';
    let currentContent = null;
    let currentFlashcardIndex = 0;
    let flashcardFlipped = false;
    let quizAnswers = [];
    let testAnswers = [];

    function goToStep(step) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step' + step).classList.add('active');
    }

    function showError(message) {
      const errorDiv = document.getElementById('errorMessage');
      errorDiv.innerHTML = '<div class="error">' + message + '</div>';
      setTimeout(() => errorDiv.innerHTML = '', 5000);
    }

    function showLoading(message = 'Loading...') {
      document.getElementById('contentArea').innerHTML =
        '<div class="loading"><div class="spinner"></div><p>' + message + '</p></div>';
    }

    async function validateClass() {
      const className = document.getElementById('className').value.trim();
      const topic = document.getElementById('topic').value.trim();

      if (!className) {
        showError('Please enter a class or subject name');
        return;
      }

      currentClass = className;
      currentTopic = topic;

      try {
        const response = await fetch('/api/validate-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ className })
        });

        const data = await response.json();

        if (data.valid) {
          goToStep(2);
        } else {
          showError(data.message || 'This does not appear to be a valid academic subject. Please try again.');
        }
      } catch (error) {
        showError('Error validating class: ' + error.message);
      }
    }

    async function selectMode(mode) {
      currentMode = mode;
      goToStep(3);

      if (mode === 'flashcards') {
        await generateFlashcards();
      } else if (mode === 'quiz') {
        await generateQuiz();
      } else if (mode === 'test') {
        await generateTest();
      }
    }

    async function generateFlashcards() {
      showLoading('Generating flashcards...');

      try {
        const response = await fetch('/api/generate-flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            className: currentClass,
            topic: currentTopic,
            sessionId,
            count: 10
          })
        });

        const data = await response.json();
        currentContent = data;
        currentFlashcardIndex = 0;
        flashcardFlipped = false;
        displayFlashcard();
      } catch (error) {
        document.getElementById('contentArea').innerHTML =
          '<div class="error">Error generating flashcards: ' + error.message + '</div>';
      }
    }

    function displayFlashcard() {
      if (!currentContent || !currentContent.flashcards) return;

      const card = currentContent.flashcards[currentFlashcardIndex];
      const total = currentContent.flashcards.length;

      const html = \`
        <div style="margin-bottom: 20px;">
          <button class="btn btn-secondary" onclick="goToStep(2)">← Back to Modes</button>
          <h2 style="display: inline-block; margin-left: 20px;">Flashcards</h2>
        </div>
        <div class="flashcard \${flashcardFlipped ? 'flipped' : ''}" onclick="flipCard()">
          <div class="flashcard-label">\${flashcardFlipped ? 'Answer' : 'Question'}</div>
          <div>\${flashcardFlipped ? card.answer : card.question}</div>
        </div>
        <div class="flashcard-nav">
          <button class="btn" onclick="prevCard()" \${currentFlashcardIndex === 0 ? 'disabled' : ''}>← Previous</button>
          <span style="color: #6b7280; font-weight: 600;">Card \${currentFlashcardIndex + 1} of \${total}</span>
          <button class="btn" onclick="nextCard()" \${currentFlashcardIndex === total - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      \`;

      document.getElementById('contentArea').innerHTML = html;
    }

    function flipCard() {
      flashcardFlipped = !flashcardFlipped;
      displayFlashcard();
    }

    function nextCard() {
      if (currentFlashcardIndex < currentContent.flashcards.length - 1) {
        currentFlashcardIndex++;
        flashcardFlipped = false;
        displayFlashcard();
      }
    }

    function prevCard() {
      if (currentFlashcardIndex > 0) {
        currentFlashcardIndex--;
        flashcardFlipped = false;
        displayFlashcard();
      }
    }

    async function generateQuiz() {
      showLoading('Generating quiz...');

      try {
        const response = await fetch('/api/generate-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            className: currentClass,
            topic: currentTopic,
            sessionId,
            count: 5
          })
        });

        const data = await response.json();
        currentContent = data;
        quizAnswers = new Array(data.questions.length).fill(null);
        displayQuiz();
      } catch (error) {
        document.getElementById('contentArea').innerHTML =
          '<div class="error">Error generating quiz: ' + error.message + '</div>';
      }
    }

    function displayQuiz() {
      if (!currentContent || !currentContent.questions) return;

      let html = \`
        <div style="margin-bottom: 20px;">
          <button class="btn btn-secondary" onclick="goToStep(2)">← Back to Modes</button>
          <h2 style="display: inline-block; margin-left: 20px;">Practice Quiz</h2>
        </div>
      \`;

      currentContent.questions.forEach((q, i) => {
        const answered = quizAnswers[i] !== null;
        const correct = answered && quizAnswers[i] === q.correct;

        html += \`
          <div class="quiz-question">
            <div class="question-number">Question \${i + 1}</div>
            <div class="question-text">\${q.question}</div>
            <div class="options">
              \${q.options.map((opt, optIndex) => {
                let className = 'option';
                if (answered) {
                  if (optIndex === q.correct) className += ' correct';
                  else if (optIndex === quizAnswers[i]) className += ' incorrect';
                } else if (quizAnswers[i] === optIndex) {
                  className += ' selected';
                }
                return \`<div class="\${className}" onclick="\${answered ? '' : 'selectQuizAnswer(' + i + ', ' + optIndex + ')'}">\${opt}</div>\`;
              }).join('')}
            </div>
            <div class="hint-toggle" onclick="toggleHint(\${i})">💡 Show Hint</div>
            <div class="hint-content" id="hint\${i}">\${q.hint}</div>
            \${answered ? '<div class="explanation"><strong>Explanation:</strong> ' + q.explanation + '</div>' : ''}
          </div>
        \`;
      });

      document.getElementById('contentArea').innerHTML = html;
    }

    function selectQuizAnswer(questionIndex, optionIndex) {
      quizAnswers[questionIndex] = optionIndex;
      displayQuiz();
    }

    function toggleHint(questionIndex) {
      const hint = document.getElementById('hint' + questionIndex);
      hint.classList.toggle('show');
    }

    async function generateTest() {
      showLoading('Generating test...');

      try {
        const response = await fetch('/api/generate-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            className: currentClass,
            topic: currentTopic,
            sessionId,
            count: 10
          })
        });

        const data = await response.json();
        currentContent = data;
        testAnswers = new Array(data.questions.length).fill('');
        displayTest();
      } catch (error) {
        document.getElementById('contentArea').innerHTML =
          '<div class="error">Error generating test: ' + error.message + '</div>';
      }
    }

    function displayTest() {
      if (!currentContent || !currentContent.questions) return;

      let html = \`
        <div style="margin-bottom: 20px;">
          <button class="btn btn-secondary" onclick="goToStep(2)">← Back to Modes</button>
          <h2 style="display: inline-block; margin-left: 20px;">Graded Test</h2>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <strong>Instructions:</strong> Answer all questions to the best of your ability. Click "Submit Test" when finished to receive your grade and feedback.
        </div>
      \`;

      currentContent.questions.forEach((q, i) => {
        html += \`
          <div class="test-question">
            <div class="question-number">Question \${i + 1} (\${q.points || 10} points)</div>
            <div class="question-text">\${q.question}</div>
        \`;

        if (q.type === 'multiple_choice' && q.options) {
          html += '<div class="options">';
          q.options.forEach((opt, optIndex) => {
            html += \`<div class="option" onclick="testAnswers[\${i}] = \${optIndex}; this.parentElement.querySelectorAll('.option').forEach(o => o.classList.remove('selected')); this.classList.add('selected');">\${opt}</div>\`;
          });
          html += '</div>';
        } else {
          html += \`<input type="text" class="test-input" oninput="testAnswers[\${i}] = this.value" placeholder="Enter your answer..." />\`;
        }

        html += '</div>';
      });

      html += '<button class="btn" onclick="submitTest()" style="margin-top: 20px;">Submit Test for Grading</button>';

      document.getElementById('contentArea').innerHTML = html;
    }

    async function submitTest() {
      showLoading('Grading your test...');

      try {
        const response = await fetch('/api/grade-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: testAnswers,
            sessionId
          })
        });

        const grading = await response.json();
        displayTestResults(grading);
      } catch (error) {
        document.getElementById('contentArea').innerHTML =
          '<div class="error">Error grading test: ' + error.message + '</div>';
      }
    }

    function displayTestResults(grading) {
      const percentage = Math.round((grading.totalScore / grading.totalPossible) * 100);

      let html = \`
        <div style="margin-bottom: 20px;">
          <button class="btn btn-secondary" onclick="goToStep(2)">← Back to Modes</button>
          <h2 style="display: inline-block; margin-left: 20px;">Test Results</h2>
        </div>
        <div class="score-header">
          <div class="score-value">\${percentage}%</div>
          <div>\${grading.totalScore} / \${grading.totalPossible} points</div>
        </div>
        <div class="test-results">
          <h3 style="margin-bottom: 20px;">Detailed Feedback</h3>
      \`;

      grading.results.forEach((result, i) => {
        const question = currentContent.questions[i];
        html += \`
          <div class="result-item">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <strong>Question \${i + 1}</strong>
              <span style="color: \${result.pointsEarned === result.pointsPossible ? '#10b981' : '#f59e0b'};">
                \${result.pointsEarned} / \${result.pointsPossible} points
              </span>
            </div>
            <div style="color: #6b7280; margin-bottom: 8px;">\${question.question}</div>
            <div style="font-size: 14px; line-height: 1.6;">\${result.feedback}</div>
          </div>
        \`;
      });

      html += '</div>';

      document.getElementById('contentArea').innerHTML = html;
    }
  </script>
</body>
</html>
`;
