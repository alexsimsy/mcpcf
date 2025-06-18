import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Types for tool information
interface ToolInfo {
    name: string;
    description: string;
    parameters: {
        name: string;
        description: string;
        type: string;
        enum?: string[];
    }[];
    group: string;
}

// Function to extract tool information from the codebase
function extractToolInfo(): ToolInfo[] {
    const tools: ToolInfo[] = [];
    const sourceFile = path.join(process.cwd(), 'src', 'index.ts');
    const content = fs.readFileSync(sourceFile, 'utf-8');

    // Regular expressions to match tool definitions
    const toolRegex = /this\.server\.tool\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*{([^}]+)}\s*,\s*{([^}]+)}/g;
    const paramRegex = /(\w+):\s*z\.(?:enum\(\[([^\]]+)\]\)|string\(\))\.describe\("([^"]+)"\)/g;

    let match;
    while ((match = toolRegex.exec(content)) !== null) {
        const [_, name, description, paramsStr, groupStr] = match;
        const parameters: ToolInfo['parameters'] = [];
        let paramMatch;

        // Extract parameters
        while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
            const [__, paramName, enumValues, paramDesc] = paramMatch;
            parameters.push({
                name: paramName,
                description: paramDesc,
                type: enumValues ? 'enum' : 'string',
                enum: enumValues ? enumValues.split(',').map(v => v.trim().replace(/['"]/g, '')) : undefined
            });
        }

        // Extract group
        const groupMatch = groupStr.match(/group:\s*"([^"]+)"/);
        const group = groupMatch ? groupMatch[1] : 'General';

        tools.push({
            name,
            description,
            parameters,
            group
        });
    }

    return tools;
}

// Function to generate the main README content
function generateMainReadme(tools: ToolInfo[]): string {
    const toolSections = tools.map(tool => {
        const paramList = tool.parameters.map(param => {
            let paramDesc = `- \`${param.name}\`: ${param.description}`;
            if (param.type === 'enum') {
                paramDesc += `\n  - Available options: ${param.enum?.join(', ')}`;
            }
            return paramDesc;
        }).join('\n');

        return `#### ${tool.name}
- **Purpose:** ${tool.description}
${paramList ? `- **Parameters:**\n${paramList}` : ''}
- **Group:** ${tool.group}`;
    }).join('\n\n');

    return `# S-IMSY MCP Server

Welcome to the S-IMSY MCP Server! This guide will help you connect to the server from a variety of clients, including those that support SSE, streamable HTTP, and those that require a local proxy using \`mcp-remote\`.

---

## 🚀 Endpoints

- **SSE:**  
  \`https://mcp.s-imsy.com/sse\`
- **HTTP (streamable):**  
  \`https://mcp.s-imsy.com/mcp\`

---

## 🔑 Authentication

- **You must obtain your MCP Token from the [SIMSY App](https://simsy.app).**
- The server expects your MCP Token as a Bearer token in the \`Authorization\` header:
  \`\`\`
  Authorization: Bearer YOUR_TOKEN_HERE
  \`\`\`

---

## 🛠️ Tools Available

### General Group

${toolSections}

---

## 1. Connecting with Direct HTTP/SSE (for clients that support it)

### Example JSON Config

\`\`\`json
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
\`\`\`
- Replace \`YOUR_TOKEN_HERE\` with your actual MCP Token from the SIMSY App.

### Works With:
- Some advanced MCP clients (future versions of Claude, Cursor, Windsurf, etc.)
- Any tool that allows custom HTTP headers in its MCP config

---

## 2. Connecting with \`mcp-remote\` (for stdio-only clients like VS Code, Claude Desktop, Cursor, Windsurf)

If your client does **not** support direct HTTP/SSE connections or custom headers, use [\`mcp-remote\`](https://www.npmjs.com/package/mcp-remote) as a local proxy.

### Install Requirements

- Node.js (v18+)
- \`npx\` (comes with Node.js)

### Example JSON Config

\`\`\`json
{
  "mcpServers": {
    "simsy-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.s-imsy.com/sse",
        "--header",
        "Authorization:Bearer \${AUTH_TOKEN}"
      ],
      "env": {
        "AUTH_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
\`\`\`
- **Note:** No space after the colon in \`"Authorization:Bearer ..."\` to avoid argument parsing bugs in some clients.
- Replace \`YOUR_TOKEN_HERE\` with your MCP Token from the SIMSY App.

### Works With:
- VS Code (via Roo Code/Anthropic MCP extension)
- Claude Desktop
- Cursor
- Windsurf
- Any other stdio-only MCP client

### How it works:
- \`mcp-remote\` runs locally, connects to your remote MCP server, and handles authentication.
- Your client connects to \`mcp-remote\` as if it were a local MCP server.

---

## 3. Troubleshooting

- **Authentication Fails:**  
  Double-check your MCP Token from the SIMSY App. Make sure it is current and entered exactly.
- **Client Does Not Support HTTP/SSE:**  
  Use the \`mcp-remote\` method as described above.
- **Still Having Issues?**  
  - Make sure your Node.js and \`npx\` are up to date.
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

If you have any questions or need further help, please contact the SIMSY support team or refer to the documentation above.`;
}

// Function to generate the user README content
function generateUserReadme(tools: ToolInfo[]): string {
    const toolList = tools.map(tool => `- **${tool.name}:** ${tool.description}`).join('\n');

    return `# S-IMSY MCP Server — User Guide

Welcome! This guide is for end users of the S-IMSY MCP Server. It provides a quickstart, common troubleshooting, and answers to frequently asked questions. For technical details and advanced configuration, see the main \`README.md\`.

---

## 🚦 Quickstart

1. **Get your MCP Token:**
   - Log in to the [SIMSY App](https://simsy.app) and copy your MCP Token from your account page.

2. **Connect your client:**
   - If your tool supports direct HTTP/SSE MCP servers, use:
     - URL: \`https://mcp.s-imsy.com/mcp\`
     - Bearer token: your MCP Token
   - If your tool only supports local/stdio MCP servers (VS Code, Claude Desktop, Cursor, Windsurf, etc.), use the [\`mcp-remote\`](https://www.npmjs.com/package/mcp-remote) proxy as described in the main README.

3. **Use the tools:**
${toolList}

---

## 📝 Notes

- **SIM Name Selection:**
  - Most clients will show a dropdown of available SIM names. If not, type the name exactly as shown in the \`getSims\` output.
  - If you enter an invalid name, the error message will list all available SIM names.

- **Authentication:**
  - Always use your MCP Token as a Bearer token. Never share your token.

- **Troubleshooting:**
  - If you have connection or authentication issues, double-check your token and client configuration.
  - For stdio-only clients, make sure you are using \`mcp-remote\` as described in the main README.

---

## ❓ FAQ

**Q: Where do I get my MCP Token?**  
A: From the [SIMSY App](https://simsy.app) — log in and copy it from your account page.

**Q: My client says it can't connect. What do I do?**  
A: Make sure you are using the correct URL and token. If your client doesn't support HTTP/SSE, use \`mcp-remote\` as a local proxy.

**Q: How do I select a SIM?**  
A: Use the dropdown if available, or type the SIM name exactly as shown in the list from \`getSims\`.

**Q: How do I send an SMS?**  
A: Use the \`sendSms\` tool, select the SIM, and enter your message.

**Q: Is my data secure?**  
A: Yes, as long as you keep your MCP Token private. If you think your token is compromised, generate a new one in the SIMSY App.

---

## 📚 More Info

- For advanced configuration, troubleshooting, and technical details, see the main \`README.md\` in this repository.
- This user guide is kept up to date with code changes. If you notice anything out of date, please let the SIMSY team know!`;
}

// Main function to update both READMEs
function updateReadmes() {
    try {
        // Extract tool information
        const tools = extractToolInfo();
        
        // Generate README content
        const mainReadmeContent = generateMainReadme(tools);
        const userReadmeContent = generateUserReadme(tools);
        
        // Write files
        fs.writeFileSync('README.md', mainReadmeContent);
        fs.writeFileSync('USER_README.md', userReadmeContent);
        
        console.log('✅ Successfully updated README.md and USER_README.md');
        
        // Stage the changes in git
        execSync('git add README.md USER_README.md');
        console.log('✅ Staged README changes in git');
        
    } catch (error) {
        console.error('❌ Error updating READMEs:', error);
        process.exit(1);
    }
}

// Run the update
updateReadmes(); 