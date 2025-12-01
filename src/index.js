/**
 * Main Worker entry point
 * Handles routing and orchestrates the chat application
 */

// Import the Durable Object
export { ChatStorage } from './chatStorage.js';

export default {
  async fetch(request, env, ctx) {
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

      // API endpoint for chat
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        return handleChat(request, env, corsHeaders);
      }

      // API endpoint to get chat history
      if (url.pathname === '/api/history' && request.method === 'GET') {
        return handleGetHistory(request, env, corsHeaders);
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
 * Handle chat API requests
 */
async function handleChat(request, env, corsHeaders) {
  const { message, sessionId = 'default' } = await request.json();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Get Durable Object instance for this session
  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);

  // Get conversation history
  const history = await stub.fetch('http://internal/history').then(r => r.json());

  // Build messages array for LLM
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful AI assistant. Be concise, friendly, and informative.',
    },
    ...history,
    { role: 'user', content: message },
  ];

  // Call Workers AI with Llama 3.3
  const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages,
    max_tokens: 512,
    temperature: 0.7,
  });

  const assistantMessage = response.response;

  // Store the conversation in Durable Object
  await stub.fetch('http://internal/add', {
    method: 'POST',
    body: JSON.stringify({
      userMessage: message,
      assistantMessage,
    }),
  });

  return new Response(
    JSON.stringify({
      response: assistantMessage,
      sessionId,
    }),
    {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
}

/**
 * Get chat history for a session
 */
async function handleGetHistory(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId') || 'default';

  const id = env.CHAT_STORAGE.idFromName(sessionId);
  const stub = env.CHAT_STORAGE.get(id);

  const history = await stub.fetch('http://internal/history').then(r => r.json());

  return new Response(JSON.stringify({ history }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Inline HTML for the chat interface
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Chat - Cloudflare Workers</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .chat-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 100%;
      max-width: 800px;
      height: 600px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
      font-size: 20px;
      font-weight: 600;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      display: flex;
      gap: 12px;
      max-width: 80%;
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .message.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    .message.user .message-avatar {
      background: #667eea;
    }

    .message.assistant .message-avatar {
      background: #764ba2;
    }

    .message-content {
      background: #f3f4f6;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.5;
    }

    .message.user .message-content {
      background: #667eea;
      color: white;
    }

    .chat-input-container {
      padding: 20px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 12px;
    }

    #messageInput {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    #messageInput:focus {
      border-color: #667eea;
    }

    #sendButton {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s;
    }

    #sendButton:hover {
      transform: translateY(-2px);
    }

    #sendButton:active {
      transform: translateY(0);
    }

    #sendButton:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .loading {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
    }

    .loading-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #667eea;
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .loading-dot:nth-child(1) { animation-delay: -0.32s; }
    .loading-dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="chat-container">
    <div class="chat-header">
      AI Chat Assistant - Powered by Cloudflare Workers AI
    </div>
    <div class="chat-messages" id="chatMessages">
      <div class="message assistant">
        <div class="message-avatar">🤖</div>
        <div class="message-content">
          Hello! I'm your AI assistant powered by Llama 3.3. How can I help you today?
        </div>
      </div>
    </div>
    <div class="chat-input-container">
      <input
        type="text"
        id="messageInput"
        placeholder="Type your message..."
        autocomplete="off"
      />
      <button id="sendButton">Send</button>
    </div>
  </div>

  <script>
    const messagesContainer = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    let sessionId = 'session_' + Date.now();

    function addMessage(content, role) {
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = role === 'user' ? '👤' : '🤖';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.textContent = content;

      messageDiv.appendChild(avatar);
      messageDiv.appendChild(contentDiv);
      messagesContainer.appendChild(messageDiv);

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showLoading() {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'message assistant';
      loadingDiv.id = 'loading';

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = '🤖';

      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.innerHTML = '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div>';

      loadingDiv.appendChild(avatar);
      loadingDiv.appendChild(loading);
      messagesContainer.appendChild(loadingDiv);

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function hideLoading() {
      const loading = document.getElementById('loading');
      if (loading) {
        loading.remove();
      }
    }

    async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      // Add user message to UI
      addMessage(message, 'user');
      messageInput.value = '';
      sendButton.disabled = true;

      // Show loading indicator
      showLoading();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            sessionId,
          }),
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        // Hide loading and add assistant response
        hideLoading();
        addMessage(data.response, 'assistant');
      } catch (error) {
        hideLoading();
        addMessage('Sorry, there was an error processing your request: ' + error.message, 'assistant');
      } finally {
        sendButton.disabled = false;
        messageInput.focus();
      }
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    messageInput.focus();
  </script>
</body>
</html>
`;
