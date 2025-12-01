/**
 * ChatStorage Durable Object
 * Stores conversation history for each chat session
 */

export class ChatStorage {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Get conversation history
    if (url.pathname === '/history') {
      const history = (await this.state.storage.get('history')) || [];
      return new Response(JSON.stringify(history), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add a message to conversation history
    if (url.pathname === '/add' && request.method === 'POST') {
      const { userMessage, assistantMessage } = await request.json();

      const history = (await this.state.storage.get('history')) || [];

      // Add user and assistant messages
      history.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantMessage }
      );

      // Keep only last 20 messages to avoid token limits
      const trimmedHistory = history.slice(-20);

      await this.state.storage.put('history', trimmedHistory);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Clear conversation history
    if (url.pathname === '/clear' && request.method === 'POST') {
      await this.state.storage.delete('history');
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }
}
