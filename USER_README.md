# S-IMSY MCP Server — User Guide

Welcome! This guide is for end users of the S-IMSY MCP Server. It provides a quickstart, common troubleshooting, and answers to frequently asked questions. For technical details and advanced configuration, see the main `README.md`.

---

## 🚦 Quickstart

1. **Get your MCP Token:**
   - Log in to the [SIMSY App](https://simsy.app) and copy your MCP Token from your account page.

2. **Connect your client:**
   - If your tool supports direct HTTP/SSE MCP servers, use:
     - URL: `https://mcp.s-imsy.com/mcp`
     - Bearer token: your MCP Token
   - If your tool only supports local/stdio MCP servers (VS Code, Claude Desktop, Cursor, Windsurf, etc.), use the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) proxy as described in the main README.

3. **Use the tools:**


---

## 📝 Notes

- **SIM Name Selection:**
  - Most clients will show a dropdown of available SIM names. If not, type the name exactly as shown in the `getSims` output.
  - If you enter an invalid name, the error message will list all available SIM names.

- **Authentication:**
  - Always use your MCP Token as a Bearer token. Never share your token.

- **Troubleshooting:**
  - If you have connection or authentication issues, double-check your token and client configuration.
  - For stdio-only clients, make sure you are using `mcp-remote` as described in the main README.

---

## ❓ FAQ

**Q: Where do I get my MCP Token?**  
A: From the [SIMSY App](https://simsy.app) — log in and copy it from your account page.

**Q: My client says it can't connect. What do I do?**  
A: Make sure you are using the correct URL and token. If your client doesn't support HTTP/SSE, use `mcp-remote` as a local proxy.

**Q: How do I select a SIM?**  
A: Use the dropdown if available, or type the SIM name exactly as shown in the list from `getSims`.

**Q: How do I send an SMS?**  
A: Use the `sendSms` tool, select the SIM, and enter your message.

**Q: Is my data secure?**  
A: Yes, as long as you keep your MCP Token private. If you think your token is compromised, generate a new one in the SIMSY App.

---

## 📚 More Info

- For advanced configuration, troubleshooting, and technical details, see the main `README.md` in this repository.
- This user guide is kept up to date with code changes. If you notice anything out of date, please let the SIMSY team know!