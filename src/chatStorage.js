/**
 * ChatStorage Durable Object
 * Stores study session data including class, mode, progress, and content
 */

export class ChatStorage {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Get study session data
    if (url.pathname === '/session') {
      const session = (await this.state.storage.get('session')) || {};
      return new Response(JSON.stringify(session), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Set study session data (class, mode, etc.)
    if (url.pathname === '/session' && request.method === 'POST') {
      const sessionData = await request.json();
      await this.state.storage.put('session', sessionData);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Store generated content (flashcards, quiz, test)
    if (url.pathname === '/content' && request.method === 'POST') {
      const content = await request.json();
      await this.state.storage.put('content', content);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get stored content
    if (url.pathname === '/content') {
      const content = (await this.state.storage.get('content')) || null;
      return new Response(JSON.stringify(content), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Store quiz/test progress
    if (url.pathname === '/progress' && request.method === 'POST') {
      const progress = await request.json();
      await this.state.storage.put('progress', progress);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get quiz/test progress
    if (url.pathname === '/progress') {
      const progress = (await this.state.storage.get('progress')) || {};
      return new Response(JSON.stringify(progress), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Clear session
    if (url.pathname === '/clear' && request.method === 'POST') {
      await this.state.storage.deleteAll();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }
}
