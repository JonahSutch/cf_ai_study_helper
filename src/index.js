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
    :root {
      /* Light Mode Colors - Modern AI Theme */
      --bg-primary: #ffffff;
      --bg-secondary: #f5f5f5;
      --bg-tertiary: #e8e8e8;
      --bg-sidebar: #f9f9f9;
      --text-primary: #1a1a1a;
      --text-secondary: #6b6b6b;
      --text-tertiary: #9b9b9b;
      --border-color: #e0e0e0;
      --border-hover: #d0d0d0;
      --accent-primary: #8b5cf6;
      --accent-secondary: #6366f1;
      --accent-gradient: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      --accent-hover: #7c3aed;
      --success: #10b981;
      --success-bg: #d1fae5;
      --error: #ef4444;
      --error-bg: #fee2e2;
      --warning: #f59e0b;
      --warning-bg: #fef3c7;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
      --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
    }

    [data-theme="dark"] {
      /* Dark Mode Colors - Modern AI Theme */
      --bg-primary: #1a1a1a;
      --bg-secondary: #242424;
      --bg-tertiary: #2e2e2e;
      --bg-sidebar: #1e1e1e;
      --text-primary: #e8e8e8;
      --text-secondary: #b0b0b0;
      --text-tertiary: #808080;
      --border-color: #333333;
      --border-hover: #444444;
      --accent-primary: #a78bfa;
      --accent-secondary: #818cf8;
      --accent-gradient: linear-gradient(135deg, #a78bfa 0%, #818cf8 100%);
      --accent-hover: #c4b5fd;
      --success: #34d399;
      --success-bg: #064e3b;
      --error: #f87171;
      --error-bg: #7f1d1d;
      --warning: #fbbf24;
      --warning-bg: #78350f;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow: hidden;
      transition: background-color 0.3s, color 0.3s;
    }

    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
    }

    /* Header/Navbar */
    .navbar {
      background: var(--bg-sidebar);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 50px;
      flex-shrink: 0;
    }

    .navbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .navbar-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .navbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .new-session-btn {
      background: var(--accent-gradient);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .new-session-btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .new-session-btn:active {
      transform: translateY(0);
    }

    .theme-toggle {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 18px;
    }

    .theme-toggle:hover {
      background: var(--bg-secondary);
      border-color: var(--border-hover);
    }

    /* Main Layout */
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Sidebar Panels */
    .sidebar {
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .sidebar.left {
      width: 250px;
      min-width: 200px;
    }

    .sidebar.right {
      width: 250px;
      min-width: 200px;
      border-right: none;
      border-left: 1px solid var(--border-color);
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      letter-spacing: 0.5px;
    }

    .sidebar-content {
      padding: 16px;
      flex: 1;
      overflow-y: auto;
      color: var(--text-secondary);
      font-size: 14px;
    }

    /* Study Library Styles */
    .library-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-tertiary);
      font-size: 14px;
    }

    .class-section {
      margin-bottom: 12px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-secondary);
    }

    .class-header {
      padding: 12px 16px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 14px;
      color: var(--text-primary);
      user-select: none;
      transition: background-color 0.2s;
    }

    .class-header:hover {
      background: var(--bg-tertiary);
    }

    .class-header-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .class-chevron {
      transition: transform 0.2s;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .class-section.expanded .class-chevron {
      transform: rotate(90deg);
    }

    .content-list {
      display: none;
      padding: 8px;
    }

    .class-section.expanded .content-list {
      display: block;
    }

    .content-item {
      padding: 10px 12px;
      margin-bottom: 6px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      transition: all 0.2s;
      font-size: 13px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
    }

    .content-item > div:first-child {
      cursor: pointer;
    }

    .content-item:hover {
      border-color: var(--accent-primary);
      background: var(--bg-tertiary);
    }

    .content-item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2px;
    }

    .content-item-type {
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 120px;
    }

    .content-item-date {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .content-item-topic {
      color: var(--text-secondary);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mode-icon-small {
      font-size: 14px;
    }

    .new-study-btn {
      margin: 8px 8px 12px 8px;
      padding: 10px 12px;
      background: var(--accent-gradient);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: calc(100% - 16px);
    }

    .new-study-btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .new-study-btn:active {
      transform: translateY(0);
    }

    /* Resize Handles */
    .resize-handle {
      width: 4px;
      cursor: col-resize;
      background: transparent;
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 10;
    }

    .resize-handle:hover {
      background: var(--accent-primary);
    }

    .resize-handle.left {
      right: -2px;
    }

    .resize-handle.right {
      left: -2px;
    }

    /* Center Content Panel */
    .content-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 40px;
    }

    /* Step Content Styling */
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
      color: var(--text-primary);
      font-size: 14px;
    }

    input[type="text"],
    input[type="number"],
    select {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid var(--border-color);
      border-radius: 8px;
      font-size: 16px;
      background: var(--bg-primary);
      color: var(--text-primary);
      transition: border-color 0.2s;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    select:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    input[type="file"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px dashed var(--border-color);
      border-radius: 8px;
      font-size: 14px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      transition: border-color 0.2s;
      cursor: pointer;
    }

    input[type="file"]:hover {
      border-color: var(--accent-primary);
      background: var(--bg-tertiary);
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      margin-top: 4px;
    }

    .file-item-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-remove-btn {
      background: transparent;
      border: none;
      color: var(--error);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 12px;
    }

    .file-remove-btn:hover {
      color: var(--text-primary);
    }

    .btn {
      padding: 12px 24px;
      background: var(--accent-gradient);
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
      box-shadow: var(--shadow-md);
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
      background: var(--bg-tertiary);
      color: var(--text-primary);
      margin-right: 10px;
    }

    .mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .mode-card {
      border: 3px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
      background: var(--bg-secondary);
    }

    .mode-card:hover {
      border-color: var(--accent-primary);
      transform: translateY(-4px);
      box-shadow: var(--shadow-md);
    }

    .mode-card.selected {
      border-color: var(--accent-primary);
      background: var(--bg-tertiary);
    }

    .mode-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .mode-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .mode-desc {
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    .error {
      background: var(--error-bg);
      border: 1px solid var(--error);
      color: var(--error);
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .success {
      background: var(--success-bg);
      border: 1px solid var(--success);
      color: var(--success);
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .loading {
      text-align: center;
      padding: 40px;
    }

    .spinner {
      border: 4px solid var(--bg-tertiary);
      border-top: 4px solid var(--accent-primary);
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
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: 12px;
      padding: 40px;
      margin-bottom: 20px;
      min-height: 200px;
      cursor: pointer;
      transition: transform 0.3s, background-color 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 18px;
      line-height: 1.6;
      position: relative;
      color: var(--text-primary);
    }

    .flashcard:hover {
      transform: scale(1.02);
    }

    .flashcard.flipped {
      background: var(--bg-tertiary);
      border-color: var(--accent-primary);
    }

    .flashcard-label {
      position: absolute;
      top: 12px;
      right: 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-primary);
      text-transform: uppercase;
    }

    .flashcard-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
    }

    .quiz-question {
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
    }

    .question-number {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-primary);
      margin-bottom: 12px;
    }

    .question-text {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--text-primary);
    }

    .options {
      margin-bottom: 16px;
    }

    .option {
      background: var(--bg-tertiary);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.2s;
      color: var(--text-primary);
    }

    .option:hover {
      border-color: var(--accent-primary);
      background: var(--bg-secondary);
    }

    .option.selected {
      border-color: var(--accent-primary);
      background: var(--bg-secondary);
    }

    .option.correct {
      border-color: var(--success);
      background: var(--success-bg);
    }

    .option.incorrect {
      border-color: var(--error);
      background: var(--error-bg);
    }

    .hint-toggle {
      color: var(--accent-primary);
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      margin-top: 12px;
      display: inline-block;
    }

    .hint-content {
      display: none;
      background: var(--warning-bg);
      border: 1px solid var(--warning);
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary);
    }

    .hint-content.show {
      display: block;
    }

    .explanation {
      background: var(--bg-tertiary);
      border: 1px solid var(--accent-primary);
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary);
    }

    .test-results {
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: 12px;
      padding: 30px;
      margin-top: 20px;
    }

    .score-header {
      text-align: center;
      padding: 20px;
      background: var(--accent-gradient);
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
      border-bottom: 1px solid var(--border-color);
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
      border: 2px solid var(--border-color);
      border-radius: 8px;
      margin-top: 8px;
      font-size: 14px;
      background: var(--bg-primary);
      color: var(--text-primary);
      transition: border-color 0.2s;
    }

    .test-input:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    .test-instructions {
      background: #fef3c7;
      border: none;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      color: #1a1a1a;
    }

    .test-instructions strong {
      color: #000000;
    }

    .menu-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 16px;
      transition: all 0.2s;
      position: relative;
      line-height: 1;
    }

    .menu-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .dropdown-menu {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: var(--shadow-lg);
      min-width: 120px;
      z-index: 1000;
      margin-top: 4px;
    }

    .dropdown-menu.show {
      display: block;
    }

    .dropdown-item {
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.2s;
      color: var(--text-primary);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dropdown-item:hover {
      background: var(--bg-tertiary);
    }

    .dropdown-item.danger {
      color: var(--error);
    }

    .dropdown-item.danger:hover {
      background: var(--error-bg);
    }

    .quantity-options {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .quantity-btn {
      padding: 10px 20px;
      background: var(--bg-tertiary);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .quantity-btn:hover {
      border-color: var(--accent-primary);
      background: var(--bg-secondary);
    }

    .quantity-btn.selected {
      border-color: var(--accent-primary);
      background: var(--accent-primary);
      color: white;
    }

    .custom-quantity-input {
      display: none;
      margin-top: 12px;
    }

    .custom-quantity-input.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- Top Navbar -->
    <div class="navbar">
      <div class="navbar-left">
        <div class="navbar-title">
          <span>🎓</span>
          <span>AI Study Helper</span>
        </div>
      </div>
      <div class="navbar-right">
        <button class="new-session-btn" onclick="startNewSession()">
          <span>+</span>
          <span>New Study Session</span>
        </button>
        <div class="theme-toggle" onclick="toggleTheme()" id="themeToggle">
          🌙
        </div>
      </div>
    </div>

    <!-- Main Layout -->
    <div class="main-layout">
      <!-- Left Sidebar -->
      <div class="sidebar left" id="leftSidebar">
        <div class="resize-handle left" id="leftResize"></div>
        <div class="sidebar-header">Explorer</div>
        <div class="sidebar-content">
          <p>Coming soon...</p>
        </div>
      </div>

      <!-- Center Content Panel -->
      <div class="content-panel">
        <div class="content">
          <!-- Step 1: Enter Class -->
          <div id="step1" class="step active">
            <h2 style="margin-bottom: 20px;">What class are you studying for?</h2>
            <div id="errorMessage"></div>
            <div class="form-group">
              <label for="className">Class or Subject Name</label>
              <input type="text" id="className" placeholder="e.g., Biology 101, World History, Calculus" />
            </div>
            <div class="form-group">
              <label for="topic">Specific Focus (Optional)</label>
              <input type="text" id="topic" placeholder="e.g., Chapter 5, Photosynthesis, etc." />
            </div>
            <button class="btn" onclick="validateClass()">Continue</button>
          </div>

          <!-- Step 2: Select Study Mode -->
          <div id="step2" class="step">
            <div style="margin-bottom: 24px;">
              <h2 style="margin-bottom: 12px;">Choose your study mode</h2>
              <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px;">
                Class: <span style="font-weight: 600; color: var(--text-primary);" id="currentClassDisplay"></span>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="topicMode">Specific Focus (Optional - can be changed)</label>
                <input type="text" id="topicMode" placeholder="Add information about the topic" />
              </div>
            </div>
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

      <!-- Right Sidebar -->
      <div class="sidebar right" id="rightSidebar">
        <div class="resize-handle right" id="rightResize"></div>
        <div class="sidebar-header">Study Library</div>
        <div class="sidebar-content" id="libraryContent">
          <div class="library-empty">
            No saved content yet.<br>Generate flashcards, quizzes, or tests to get started!
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Session and State Variables
    let sessionId = initPersistentSession();
    let currentClass = '';
    let currentTopic = '';
    let currentMode = '';
    let currentQuantity = 10;
    let currentContent = null;
    let currentFlashcardIndex = 0;
    let flashcardFlipped = false;
    let quizAnswers = [];
    let testAnswers = [];

    // Persistent Session Management
    function initPersistentSession() {
      let id = localStorage.getItem('persistentSessionId');
      if (!id) {
        id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('persistentSessionId', id);
      }
      return id;
    }

    // Session State Persistence
    function saveSessionState() {
      const state = {
        className: currentClass,
        topic: currentTopic,
        mode: currentMode,
        content: currentContent,
        flashcardIndex: currentFlashcardIndex,
        quizAnswers: quizAnswers,
        testAnswers: testAnswers,
        timestamp: Date.now()
      };
      localStorage.setItem('currentSession', JSON.stringify(state));
    }

    function loadSessionState() {
      try {
        const saved = localStorage.getItem('currentSession');
        if (saved) {
          const state = JSON.parse(saved);
          // Only restore if session is less than 24 hours old
          if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
            currentClass = state.className || '';
            currentTopic = state.topic || '';
            currentMode = state.mode || '';
            currentContent = state.content || null;
            currentFlashcardIndex = state.flashcardIndex || 0;
            quizAnswers = state.quizAnswers || [];
            testAnswers = state.testAnswers || [];

            // Restore UI state
            if (currentClass) {
              document.getElementById('className').value = currentClass;
            }
            if (currentTopic) {
              document.getElementById('topic').value = currentTopic;
            }

            // If we have content, restore to the appropriate view
            if (currentContent && currentMode) {
              goToStep(3);
              if (currentMode === 'flashcards') {
                displayFlashcard();
              } else if (currentMode === 'quiz') {
                displayQuiz();
              } else if (currentMode === 'test') {
                displayTest();
              }
            } else if (currentClass) {
              // If we have a class but no content, go to mode selection
              goToStep(2);
            }

            return true;
          }
        }
      } catch (error) {
        console.error('Error loading session state:', error);
      }
      return false;
    }

    function clearSessionState() {
      localStorage.removeItem('currentSession');
      currentClass = '';
      currentTopic = '';
      currentMode = '';
      currentContent = null;
      currentFlashcardIndex = 0;
      quizAnswers = [];
      testAnswers = [];
    }

    // Study History Management
    function saveToHistory(className, topic, mode, content) {
      try {
        let history = JSON.parse(localStorage.getItem('studyHistory') || '[]');

        const entry = {
          id: Date.now(),
          className,
          topic,
          mode,
          contentPreview: getContentPreview(mode, content),
          timestamp: Date.now()
        };

        // Add to beginning of array
        history.unshift(entry);

        // Keep only last 20 sessions
        history = history.slice(0, 20);

        localStorage.setItem('studyHistory', JSON.stringify(history));
      } catch (error) {
        console.error('Error saving to history:', error);
      }
    }

    function getContentPreview(mode, content) {
      if (!content) return '';

      switch(mode) {
        case 'flashcards':
          return content.flashcards ? \`\${content.flashcards.length} flashcards\` : '';
        case 'quiz':
          return content.questions ? \`\${content.questions.length} questions\` : '';
        case 'test':
          return content.questions ? \`\${content.questions.length} test questions\` : '';
        default:
          return '';
      }
    }

    function getStudyHistory() {
      try {
        return JSON.parse(localStorage.getItem('studyHistory') || '[]');
      } catch (error) {
        console.error('Error loading history:', error);
        return [];
      }
    }

    // Study Library Management
    function getStudyLibrary() {
      try {
        return JSON.parse(localStorage.getItem('studyLibrary') || '{}');
      } catch (error) {
        console.error('Error loading library:', error);
        return {};
      }
    }

    function saveToLibrary(className, topic, mode, content) {
      try {
        let library = getStudyLibrary();

        // Initialize class if it doesn't exist
        if (!library[className]) {
          library[className] = {
            className: className,
            items: []
          };
        }

        // Create library item
        const item = {
          id: Date.now(),
          mode: mode,
          topic: topic || '',
          content: content,
          timestamp: Date.now()
        };

        // Add to beginning of class items
        library[className].items.unshift(item);

        // Keep only last 10 items per class
        library[className].items = library[className].items.slice(0, 10);

        localStorage.setItem('studyLibrary', JSON.stringify(library));
        renderLibrary();
      } catch (error) {
        console.error('Error saving to library:', error);
      }
    }

    function loadFromLibrary(className, itemId) {
      try {
        const library = getStudyLibrary();
        if (!library[className]) return;

        const item = library[className].items.find(i => i.id === itemId);
        if (!item) return;

        // Load the content
        currentClass = className;
        currentTopic = item.topic;
        currentMode = item.mode;
        currentContent = item.content;

        // Reset state based on mode
        if (item.mode === 'flashcards') {
          currentFlashcardIndex = 0;
          flashcardFlipped = false;
          goToStep(3);
          displayFlashcard();
        } else if (item.mode === 'quiz') {
          quizAnswers = new Array(item.content.questions.length).fill(null);
          goToStep(3);
          displayQuiz();
        } else if (item.mode === 'test') {
          testAnswers = new Array(item.content.questions.length).fill('');
          goToStep(3);
          displayTest();
        }

        saveSessionState();
      } catch (error) {
        console.error('Error loading from library:', error);
      }
    }

    function renderLibrary() {
      const library = getStudyLibrary();
      const libraryContent = document.getElementById('libraryContent');

      const classes = Object.keys(library);

      if (classes.length === 0) {
        libraryContent.innerHTML = \`
          <div class="library-empty">
            No saved content yet.<br>Generate flashcards, quizzes, or tests to get started!
          </div>
        \`;
        return;
      }

      let html = '';

      classes.forEach(className => {
        const classData = library[className];
        const itemCount = classData.items.length;

        html += \`
          <div class="class-section" id="class-\${encodeURIComponent(className)}">
            <div class="class-header" onclick="toggleClassSection('\${className.replace(/'/g, "\\'")}')">
              <span class="class-header-text" title="\${className}">\${className}</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 11px; color: var(--text-tertiary);">\${itemCount}</span>
                <span class="class-chevron">▶</span>
              </div>
            </div>
            <div class="content-list">
              <button class="new-study-btn" onclick="event.stopPropagation(); startNewStudyForClass('\${className.replace(/'/g, "\\'")}')">
                <span>+</span>
                <span>New Study Tool</span>
              </button>
        \`;

        classData.items.forEach(item => {
          const modeIcon = getModeIcon(item.mode);
          const modeName = getModeName(item.mode);
          const date = new Date(item.timestamp).toLocaleDateString();
          const topicText = item.topic ? \`Topic: \${item.topic}\` : 'General';

          html += \`
            <div class="content-item" onclick="loadFromLibrary('\${className.replace(/'/g, "\\'")}', \${item.id})">
              <div style="flex: 1;">
                <div class="content-item-header">
                  <div class="content-item-type">
                    <span class="mode-icon-small">\${modeIcon}</span>
                    <span>\${modeName}</span>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0;">
                    <div class="content-item-date">\${date}</div>
                    <div style="position: relative;">
                      <button class="menu-btn" onclick="event.stopPropagation(); toggleDropdown('menu-\${item.id}')">⋮</button>
                      <div class="dropdown-menu" id="menu-\${item.id}">
                        <div class="dropdown-item danger" onclick="event.stopPropagation(); deleteFromLibrary('\${className.replace(/'/g, "\\'")}', \${item.id})">
                          🗑️ Delete
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="content-item-topic">\${topicText}</div>
              </div>
            </div>
          \`;
        });

        html += \`
            </div>
          </div>
        \`;
      });

      libraryContent.innerHTML = html;

      // Auto-expand current class
      if (currentClass && library[currentClass]) {
        const classElement = document.getElementById(\`class-\${encodeURIComponent(currentClass)}\`);
        if (classElement) {
          classElement.classList.add('expanded');
        }
      }
    }

    function toggleClassSection(className) {
      const element = document.getElementById(\`class-\${encodeURIComponent(className)}\`);
      if (element) {
        element.classList.toggle('expanded');
      }
    }

    function getModeIcon(mode) {
      switch(mode) {
        case 'flashcards': return '📚';
        case 'quiz': return '🎯';
        case 'test': return '✅';
        default: return '📄';
      }
    }

    function getModeName(mode) {
      switch(mode) {
        case 'flashcards': return 'Flashcards';
        case 'quiz': return 'Quiz';
        case 'test': return 'Test';
        default: return 'Content';
      }
    }

    function startNewStudyForClass(className) {
      // Try to get the last used topic for this class
      const library = getStudyLibrary();
      let lastTopic = '';

      if (library[className] && library[className].items.length > 0) {
        // Get the most recent item's topic
        lastTopic = library[className].items[0].topic || '';
      }

      // Set the class and topic
      currentClass = className;
      currentTopic = lastTopic;
      currentMode = '';
      currentContent = null;

      // Update the input fields
      document.getElementById('className').value = className;
      document.getElementById('topic').value = lastTopic;

      // Clear any previous content
      currentFlashcardIndex = 0;
      flashcardFlipped = false;
      quizAnswers = [];
      testAnswers = [];

      // Save state and go to mode selection
      saveSessionState();
      goToStep(2);
    }

    function startNewSession() {
      // Clear all current state
      currentClass = '';
      currentTopic = '';
      currentMode = '';
      currentContent = null;
      currentQuantity = 10;
      currentFlashcardIndex = 0;
      flashcardFlipped = false;
      quizAnswers = [];
      testAnswers = [];

      // Clear input fields
      document.getElementById('className').value = '';
      document.getElementById('topic').value = '';

      // Save cleared state
      saveSessionState();

      // Go back to step 1
      goToStep(1);
    }

    // Theme Management
    function initTheme() {
      const savedTheme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeIcon(savedTheme);
    }

    function toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    }

    function updateThemeIcon(theme) {
      const themeToggle = document.getElementById('themeToggle');
      themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
    }

    // Resize Functionality
    function initResize() {
      const leftResize = document.getElementById('leftResize');
      const rightResize = document.getElementById('rightResize');
      const leftSidebar = document.getElementById('leftSidebar');
      const rightSidebar = document.getElementById('rightSidebar');

      let isResizingLeft = false;
      let isResizingRight = false;

      leftResize.addEventListener('mousedown', (e) => {
        isResizingLeft = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      rightResize.addEventListener('mousedown', (e) => {
        isResizingRight = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (isResizingLeft) {
          const newWidth = e.clientX;
          if (newWidth >= 200 && newWidth <= 600) {
            leftSidebar.style.width = newWidth + 'px';
          }
        }
        if (isResizingRight) {
          const newWidth = window.innerWidth - e.clientX;
          if (newWidth >= 200 && newWidth <= 600) {
            rightSidebar.style.width = newWidth + 'px';
          }
        }
      });

      document.addEventListener('mouseup', () => {
        isResizingLeft = false;
        isResizingRight = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      });
    }

    // Initialize on page load
    window.addEventListener('DOMContentLoaded', () => {
      initTheme();
      initResize();
      loadSessionState();
      renderLibrary();
    });

    function goToStep(step) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step' + step).classList.add('active');

      // Update step 2 with current class and topic
      if (step === 2) {
        const classDisplay = document.getElementById('currentClassDisplay');
        const topicModeInput = document.getElementById('topicMode');

        if (classDisplay) {
          classDisplay.textContent = currentClass || 'Not set';
        }

        if (topicModeInput) {
          topicModeInput.value = currentTopic || '';
        }
      }
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
          saveSessionState();
          goToStep(2);
        } else {
          showError(data.message || 'This does not appear to be a valid academic subject. Please try again.');
        }
      } catch (error) {
        showError('Error validating class: ' + error.message);
      }
    }

    async function selectMode(mode) {
      // Update topic from the mode selection page if it was changed
      const topicModeInput = document.getElementById('topicMode');
      if (topicModeInput) {
        currentTopic = topicModeInput.value.trim();
      }

      currentMode = mode;
      saveSessionState();
      goToStep(3);

      if (mode === 'flashcards') {
        generateFlashcards();
      } else if (mode === 'quiz') {
        generateQuiz();
      } else if (mode === 'test') {
        generateTest();
      }
    }

    function toggleDropdown(menuId) {
      // Close all other dropdowns
      document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu.id !== menuId) {
          menu.style.display = 'none';
        }
      });

      // Toggle the clicked dropdown
      const menu = document.getElementById(menuId);
      if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      }
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.menu-btn')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          menu.style.display = 'none';
        });
      }
    });

    function deleteFromLibrary(className, itemId) {
      // Close the dropdown
      document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.style.display = 'none';
      });

      if (!confirm('Are you sure you want to delete this study tool?')) {
        return;
      }

      try {
        let library = getStudyLibrary();

        if (library[className]) {
          library[className].items = library[className].items.filter(item => item.id !== itemId);

          // Remove the class if it has no items left
          if (library[className].items.length === 0) {
            delete library[className];
          }

          localStorage.setItem('studyLibrary', JSON.stringify(library));
          renderLibrary();
        }
      } catch (error) {
        console.error('Error deleting from library:', error);
        showError('Failed to delete item');
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
            count: currentQuantity
          })
        });

        const data = await response.json();
        currentContent = data;
        currentFlashcardIndex = 0;
        flashcardFlipped = false;
        saveSessionState();
        saveToHistory(currentClass, currentTopic, 'flashcards', data);
        saveToLibrary(currentClass, currentTopic, 'flashcards', data);
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
      saveSessionState();
    }

    function nextCard() {
      if (currentFlashcardIndex < currentContent.flashcards.length - 1) {
        currentFlashcardIndex++;
        flashcardFlipped = false;
        displayFlashcard();
        saveSessionState();
      }
    }

    function prevCard() {
      if (currentFlashcardIndex > 0) {
        currentFlashcardIndex--;
        flashcardFlipped = false;
        displayFlashcard();
        saveSessionState();
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
            count: currentQuantity
          })
        });

        const data = await response.json();
        currentContent = data;
        quizAnswers = new Array(data.questions.length).fill(null);
        saveSessionState();
        saveToHistory(currentClass, currentTopic, 'quiz', data);
        saveToLibrary(currentClass, currentTopic, 'quiz', data);
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
      saveSessionState();
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
            count: currentQuantity
          })
        });

        const data = await response.json();
        currentContent = data;
        testAnswers = new Array(data.questions.length).fill('');
        saveSessionState();
        saveToHistory(currentClass, currentTopic, 'test', data);
        saveToLibrary(currentClass, currentTopic, 'test', data);
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
        <div class="test-instructions">
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
