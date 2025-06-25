# S-IMSY MCP Server

Welcome to the S-IMSY MCP Server! This guide will help you connect to the server from a variety of clients, including those that support SSE, streamable HTTP, and those that require a local proxy using `mcp-remote`.

---

## 🚀 Endpoints

- **SSE:**  
  `https://mcp.s-imsy.com/sse`
- **HTTP (streamable):**  
  `https://mcp.s-imsy.com/mcp`

---

## 🔑 Authentication

- **You must obtain your MCP Token from the [SIMSY App](https://simsy.app).**
- The server expects your MCP Token as a Bearer token in the `Authorization` header:
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  ```

---

## 🛠️ Tools Available

### General Group



---

## 1. Connecting with Direct HTTP/SSE (for clients that support it)

### Example JSON Config

```json
{
  "mcpServers": {
    "simsy-remote": {
      "type": "http",
      "url": "https://mcp.s-imsy.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```
- Replace `YOUR_TOKEN_HERE` with your actual MCP Token from the SIMSY App.

### Works With:
- Some advanced MCP clients (future versions of Claude, Cursor, Windsurf, etc.)
- Any tool that allows custom HTTP headers in its MCP config

---

## 2. Connecting with `mcp-remote` (for stdio-only clients like VS Code, Claude Desktop, Cursor, Windsurf)

If your client does **not** support direct HTTP/SSE connections or custom headers, use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) as a local proxy.

### Install Requirements

- Node.js (v18+)
- `npx` (comes with Node.js)

### Example JSON Config

```json
{
  "mcpServers": {
    "simsy-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.s-imsy.com/sse",
        "--header",
        "Authorization:Bearer ${AUTH_TOKEN}"
      ],
      "env": {
        "AUTH_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```
- **Note:** No space after the colon in `"Authorization:Bearer ..."` to avoid argument parsing bugs in some clients.
- Replace `YOUR_TOKEN_HERE` with your MCP Token from the SIMSY App.

### Works With:
- VS Code (via Roo Code/Anthropic MCP extension)
- Claude Desktop
- Cursor
- Windsurf
- Any other stdio-only MCP client

### How it works:
- `mcp-remote` runs locally, connects to your remote MCP server, and handles authentication.
- Your client connects to `mcp-remote` as if it were a local MCP server.

---

## 3. Troubleshooting

- **Authentication Fails:**  
  Double-check your MCP Token from the SIMSY App. Make sure it is current and entered exactly.
- **Client Does Not Support HTTP/SSE:**  
  Use the `mcp-remote` method as described above.
- **Still Having Issues?**  
  - Make sure your Node.js and `npx` are up to date.
  - Check the [mcp-remote documentation](https://www.npmjs.com/package/mcp-remote) for advanced flags and troubleshooting.

---

## 4. Security Note

- **Never share your MCP Token.**  
  Treat it like a password.
- **If you believe your token is compromised, generate a new one in the SIMSY App.**

---

## 5. References

- [SIMSY App](https://simsy.app) — for obtaining your MCP Token
- [mcp-remote npm package](https://www.npmjs.com/package/mcp-remote)
- [Cloudflare MCP Server Docs](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)

---

If you have any questions or need further help, please contact the SIMSY support team or refer to the documentation above.