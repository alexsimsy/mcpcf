# MCP Server

A Mobile Telecoms MCP server that allows customers to control their SIMs like a mobile operator.

## Configuration

The server can be configured using environment variables or by modifying the `config.ts` file.

### Token Configuration

The server requires a token for authentication. You can set the token in one of two ways:

1. **Environment Variable**:
   ```bash
   export MCP_CONFIG='{"token": "your-token-here"}'
   ```

2. **Config File**:
   Modify the `config.ts` file and update the `defaultConfig` object:
   ```typescript
   const defaultConfig = {
       token: "your-token-here",
   };
   ```

### Default Configuration

The server comes with a default test token for development purposes. In production, you should replace this with your own token.

## Session and Token Management (KV & D1)

- When a user authenticates, their token is stored in Cloudflare KV using a `sessionId`.
- Session metadata (sessionId, userId, token, created_at) is stored in Cloudflare D1.
- Subsequent requests can use the sessionId (via the `Mcp-Session-Id` header) to validate the token.
- If no sessionId is provided, the server falls back to the config token for validation.

### Example: Store a Token and Create a Session

```http
POST /verify-token
Content-Type: application/json

{
  "token": "user-jwt-or-api-token",
  "sessionId": "abc123",
  "userId": "user-uuid" // optional
}
```
- Stores the token in KV for 1 hour.
- Creates a session row in D1 with metadata.

### Example: MCP Request with Session

Send the sessionId in the `Mcp-Session-Id` header and the token in the Authorization header:

```
Authorization: Bearer user-jwt-or-api-token
Mcp-Session-Id: abc123
```

The server will validate the token using KV (and fallback to config if not found).

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npx wrangler dev
   ```

3. Run tests:
   ```bash
   npx tsx test.ts
   ```

## API Endpoints

- `/health` - Health check endpoint
- `/verify-token` - Store a token in KV and create a session in D1
- `/kv-token` - Directly store/retrieve a token in KV (for testing)
- `/d1-test` - Insert/query a user row in D1 (for testing)
- `/sse` - Server-Sent Events endpoint
- `/mcp` - MCP protocol endpoint (requires token and sessionId)
- `/stream` - Streaming endpoint

## MCP Inspector Testing

To test the server using the MCP inspector, use the following configuration:

### Server Configuration
- Server URL: `http://localhost:8787/mcp`
- SSE URL: `http://localhost:8787/sse`

### Authentication

The MCP endpoint requires authentication. You can provide the token in two ways:

1. **Authorization Header**:
   ```
   Authorization: Bearer your-token-here
   Mcp-Session-Id: your-session-id
   ```

2. **Request Body**:
   ```json
   {
     "token": "your-token-here",
     "sessionId": "your-session-id",
     "tool": "add",
     "params": {
       "a": 5,
       "b": 3
     }
   }
   ```

### Available Tools

1. **Add Tool**
   ```json
   {
     "tool": "add",
     "params": {
       "a": 5,
       "b": 3
     }
   }
   ```

2. **Calculate Tool**
   ```json
   {
     "tool": "calculate",
     "params": {
       "operation": "add",
       "a": 5,
       "b": 3
     }
   }
   ```
   Available operations: `add`, `subtract`, `multiply`, `divide`

### Testing Flow

1. Start the server:
   ```bash
   npx wrangler dev
   ```

2. Open the MCP inspector in your browser

3. Configure the inspector with:
   - Server URL: `http://localhost:8787/mcp`
   - SSE URL: `http://localhost:8787/sse`
   - Add the Authorization header with your token
   - Add the Mcp-Session-Id header with your sessionId

4. Test the tools:
   - Try the `add` tool with different numbers
   - Try the `calculate` tool with different operations
   - Verify SSE connections are working
   - Check that responses are properly formatted

### Example Responses

1. Add Tool Response:
   ```json
   {
     "content": [
       {
         "type": "text",
         "text": "8"
       }
     ]
   }
   ```

2. Calculate Tool Response:
   ```json
   {
     "content": [
       {
         "type": "text",
         "text": "8"
       }
     ]
   }
   ```

### Error Responses

1. No Token Provided:
   ```json
   {
     "error": "No token provided"
   }
   ```

2. Invalid Token:
   ```json
   {
     "error": "Invalid token"
   }
   ```

## Security

- All endpoints are protected with CORS headers
- Token verification is required for sensitive operations
- Error responses are properly formatted and logged

## Testing

The test suite verifies:
- Token verification
- SSE functionality
- Stream handling
- MCP protocol
- Error handling
- CORS configuration

# MCP Cloudflare Worker (No Auth)

This is the working repository for the MCP server deployed on Cloudflare Workers, maintained by the team at [alexsimsy/mcpcf](https://github.com/alexsimsy/mcpcf).

## Live Deployment

Your MCP server is live at:

- [https://mcpcf.alex-ec1.workers.dev/mcp](https://mcpcf.alex-ec1.workers.dev/mcp)
- SSE endpoint: [https://mcpcf.alex-ec1.workers.dev/sse](https://mcpcf.alex-ec1.workers.dev/sse)

## Getting Started

Clone this repo:
```bash
git clone https://github.com/alexsimsy/mcpcf.git
cd mcpcf
npm install
```

To run locally:
```bash
cd mcpcf
npm start
```

To deploy:
```bash
cd mcpcf
npm run deploy
```

## Customizing your MCP Server

Add your own [tools](https://developers.cloudflare.com/agents/model-context-protocol/tools/) to the MCP server by editing the `init()` method in `src/index.ts` using `this.server.tool(...)`.

## Connect to Cloudflare AI Playground

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL: `https://mcpcf.alex-ec1.workers.dev/sse`
3. Use your MCP tools directly from the playground!

## Connect Claude Desktop to your MCP server

You can connect to your remote MCP server from local MCP clients using [mcp-remote](https://www.npmjs.com/package/mcp-remote). 

Example config for Claude Desktop:
```json
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcpcf.alex-ec1.workers.dev/sse"
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available.

---

## Project Roadmap
- [ ] Add more example tools
- [ ] Add authentication (optional)
- [ ] Write more tests
- [ ] Improve documentation
- [ ] Set up GitHub Actions for CI/CD

Feel free to open issues or pull requests as we continue to improve this project!
