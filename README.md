# AI Chat Application - Cloudflare Workers

A serverless AI chat application built with Cloudflare Workers, Workers AI (Llama 3.3), and Durable Objects for persistent conversation memory.

## Features

- **Serverless Architecture**: Runs entirely on Cloudflare Workers
- **AI-Powered**: Uses Llama 3.3 70B via Workers AI
- **Persistent Memory**: Durable Objects store conversation history
- **Beautiful UI**: Clean, responsive chat interface
- **Fast & Scalable**: Global edge network deployment

## Project Structure

```
.
├── src/
│   ├── index.js          # Main Worker entry point
│   └── chatStorage.js    # Durable Object for conversation storage
├── wrangler.toml         # Cloudflare Workers configuration
└── package.json          # Project dependencies
```

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Cloudflare account
- Wrangler CLI

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Run locally**:
   ```bash
   npm run dev
   ```

4. **Deploy to Cloudflare**:
   ```bash
   npm run deploy
   ```

## How It Works

1. **User Interface**: Simple HTML/CSS/JS chat interface served directly from the Worker
2. **API Endpoint**: `/api/chat` accepts POST requests with user messages
3. **Durable Objects**: Each chat session gets a unique Durable Object instance to store conversation history
4. **Workers AI**: Calls Llama 3.3 70B model with full conversation context
5. **Persistent Memory**: Conversations are maintained across page refreshes

## API Endpoints

- `GET /` - Chat interface
- `POST /api/chat` - Send a message
  ```json
  {
    "message": "Hello!",
    "sessionId": "optional-session-id"
  }
  ```
- `GET /api/history?sessionId=xxx` - Get conversation history

## Configuration

Edit [wrangler.toml](wrangler.toml) to customize:
- Worker name
- AI model
- Durable Objects settings

## Development Timeline

This project was built following an accelerated timeline:
- **Day 1**: Setup & Core Structure (3-4 hours)
- **Day 2**: LLM Integration & Basic Chat (4-5 hours)
- **Day 3**: Memory & State (3-4 hours)
- **Day 4**: Workflows + Polish + Deploy (4-5 hours)

Total: 15-18 hours over 3-4 days

## Technologies

- Cloudflare Workers
- Workers AI (Llama 3.3 70B)
- Durable Objects
- JavaScript
- HTML/CSS

## License

MIT
