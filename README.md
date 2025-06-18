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

#### 1. `getSims`
- **Purpose:** Get an overview of all SIMs on your account.
- **Returns:**  
  - SIM ID  
  - SIM Name  
  - Network Status  
  - Total number of SIMs
- **Usage:** Use this tool to list and identify the SIMs you want to work with.

#### 2. `getSimInfo`
- **Purpose:** Get detailed information about a specific SIM.
- **Input:** SIM Name (as shown in the `getSims` output)
- **SIM Name Selection:**
  - If your client supports it, you will see a dropdown of available SIM names for easy selection.
  - If not, you can type the SIM name manually. If the name is invalid, the error message will list all available SIM names.
- **Returns:**  
  - `latestActivity`
  - `endpointStatus.active` (true/false)
  - `endpointNetworkStatus.active` (true/false)
  - `latestRatType.name`
  - `latestServingOperatorDescription`
  - `latestCountryName`
  - `usageRolling24H` (in MB)
  - `usageRolling7D` (in MB)
  - `usageRolling28D` (in MB)
- **Usage:** Use this tool to get a detailed, normalized view of a SIM's status and usage.

#### 3. `sendSms`
- **Purpose:** Send an SMS message to a SIM card.
- **Inputs:**
  - `name`: The name of the SIM (dropdown or manual entry, as above)
  - `payloadText`: The SMS message you want to send
- **SIM Name Selection:**
  - If your client supports it, you will see a dropdown of available SIM names for easy selection.
  - If not, you can type the SIM name manually. If the name is invalid, the error message will list all available SIM names.
- **How it works:**
  1. Looks up the SIM by name to get its endpoint ID.
  2. Sends a POST request to `https://api.s-imsy.com/api/v1/endpoints/{endpointId}/sms` with the message payload.
  3. Returns the API response or an error message.

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