import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import config from "../config";

// Token verification schema
const tokenSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);
	}
}

// CORS headers configuration
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

// Helper function to create SSE response
function createSSEResponse(data: string, event?: string) {
	const eventString = event ? `event: ${event}\n` : "";
	return new Response(`${eventString}data: ${data}\n\n`, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			...corsHeaders,
		},
	});
}

// Helper function to create error response
function createErrorResponse(message: string, status: number = 400) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"Content-Type": "application/json",
			...corsHeaders,
		},
	});
}

// Helper function to create success response
function createSuccessResponse(data: any, status: number = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...corsHeaders,
		},
	});
}

// Helper function to verify token (now checks KV first, then config)
async function verifyToken(token: string, sessionId: string | null, env: Env): Promise<boolean> {
	if (sessionId) {
		const kvToken = await env.SESSIONS_KV.get(sessionId);
		if (kvToken && kvToken === token) return true;
	}
	// Fallback to config token
	return token === config.token;
}

// Helper function to extract token from request
async function extractToken(request: Request): Promise<string | null> {
	// Try to get token from Authorization header
	const authHeader = request.headers.get("Authorization");
	if (authHeader?.startsWith("Bearer ")) {
		return authHeader.slice(7);
	}

	// Try to get token from request body for POST requests
	if (request.method === "POST") {
		try {
			const body = await request.clone().json() as { token?: string };
			if (body.token) {
				return body.token;
			}
		} catch (e) {
			// Ignore JSON parsing errors
		}
	}

	return null;
}

// TypeScript Env type for Cloudflare bindings
interface Env {
	SESSIONS_KV: KVNamespace;
	MY_D1: D1Database;
	// ...other bindings
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		// Debug: Log all incoming requests
		console.log(`[DEBUG] ${request.method} ${new URL(request.url).pathname}`);
		console.log(`[DEBUG] Headers:`, Object.fromEntries(request.headers.entries()));

		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: corsHeaders,
			});
		}

		const url = new URL(request.url);

		try {
			// Health check endpoint
			if (url.pathname === "/health") {
				return createSuccessResponse({ status: "healthy" });
			}

			// Token verification endpoint
			if (url.pathname === "/verify-token") {
				if (request.method !== "POST") {
					return createErrorResponse("Method not allowed", 405);
				}
				const body = await request.json() as { token?: string; sessionId?: string; userId?: string };
				const { token, sessionId, userId } = body;
				if (!token || !sessionId) {
					return createErrorResponse("token and sessionId required", 400);
				}
				// Store token in KV
				await env.SESSIONS_KV.put(sessionId, token, { expirationTtl: 3600 });
				// Create session row in D1 (optional userId)
				await env.MY_D1.prepare("CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, user_id TEXT, token TEXT, created_at DATETIME)").run();
				await env.MY_D1.prepare("INSERT OR REPLACE INTO sessions (session_id, user_id, token, created_at) VALUES (?, ?, ?, ?)")
					.bind(sessionId, userId || null, token, new Date().toISOString()).run();
				return createSuccessResponse({ ok: true, message: "Token stored in KV and session created in D1" });
			}

			// SSE endpoints
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				const sseHandler = MyMCP.serveSSE("/sse");
				const response = await sseHandler.fetch(request, env, ctx);
				
				// Add CORS headers to SSE response
				const headers = new Headers(response.headers);
				Object.entries(corsHeaders).forEach(([key, value]) => {
					headers.set(key, value);
				});
				
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers,
				});
			}

			// MCP endpoint
			if (url.pathname === "/mcp") {
				// Debug: Log MCP request
				console.log(`[DEBUG] Handling /mcp request`);
				const token = await extractToken(request);
				const sessionId = request.headers.get("Mcp-Session-Id") || null;
				console.log(`[DEBUG] Extracted token:`, token, "sessionId:", sessionId);
				if (!token) {
					console.log(`[DEBUG] No token provided, returning 401`);
					return createErrorResponse("No token provided", 401);
				}
				const isValid = await verifyToken(token, sessionId, env);
				console.log(`[DEBUG] Token valid:`, isValid);
				if (!isValid) {
					console.log(`[DEBUG] Invalid token, returning 401`);
					return createErrorResponse("Invalid token", 401);
				}
				const mcpHandler = MyMCP.serve("/mcp");
				const response = await mcpHandler.fetch(request, env, ctx);
				
				// Add CORS headers to MCP response
				const headers = new Headers(response.headers);
				Object.entries(corsHeaders).forEach(([key, value]) => {
					headers.set(key, value);
				});
				
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers,
				});
			}

			// Stream endpoint with proper SSE formatting
			if (url.pathname === "/stream") {
				const stream = new ReadableStream({
					start(controller) {
						// Send initial connection event
						controller.enqueue(new TextEncoder().encode("event: connected\ndata: Connection established\n\n"));
						
						// Send data event
						setTimeout(() => {
							controller.enqueue(new TextEncoder().encode("event: data\ndata: Streaming data...\n\n"));
							
							// Send completion event
							setTimeout(() => {
								controller.enqueue(new TextEncoder().encode("event: complete\ndata: Stream completed\n\n"));
								controller.close();
							}, 1000);
						}, 500);
					},
				});

				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"Connection": "keep-alive",
						...corsHeaders,
					},
				});
			}

			// --- Sample KV Token Endpoints ---
			if (url.pathname === "/kv-token" && request.method === "POST") {
				// Store a token in KV: expects JSON { sessionId, token }
				const body = await request.json() as { sessionId?: string; token?: string };
				const { sessionId, token } = body;
				if (!sessionId || !token) {
					return createErrorResponse("sessionId and token required", 400);
				}
				await env.SESSIONS_KV.put(sessionId, token, { expirationTtl: 3600 });
				return createSuccessResponse({ ok: true });
			}
			if (url.pathname === "/kv-token" && request.method === "GET") {
				// Retrieve a token from KV: expects ?sessionId=...
				const sessionId = url.searchParams.get("sessionId");
				if (!sessionId) {
					return createErrorResponse("sessionId required", 400);
				}
				const token = await env.SESSIONS_KV.get(sessionId);
				return createSuccessResponse({ token });
			}

			// --- Sample D1 Test Endpoints ---
			if (url.pathname === "/d1-test" && request.method === "POST") {
				// Insert a row: expects JSON { id, name }
				const body = await request.json() as { id?: string; name?: string };
				const { id, name } = body;
				if (!id || !name) {
					return createErrorResponse("id and name required", 400);
				}
				await env.MY_D1.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)").run();
				await env.MY_D1.prepare("INSERT INTO users (id, name) VALUES (?, ?)").bind(id, name).run();
				return createSuccessResponse({ ok: true });
			}
			if (url.pathname === "/d1-test" && request.method === "GET") {
				// Query a row: expects ?id=...
				const id = url.searchParams.get("id");
				if (!id) {
					return createErrorResponse("id required", 400);
				}
				await env.MY_D1.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)").run();
				const { results } = await env.MY_D1.prepare("SELECT * FROM users WHERE id = ?").bind(id).all();
				return createSuccessResponse({ user: results[0] || null });
			}

			// Not found response
			return createErrorResponse("Not found", 404);
		} catch (error) {
			// Log the error
			console.error("Error processing request:", error);
			
			// Return error response
			return createErrorResponse(
				error instanceof Error ? error.message : "Internal server error",
				error instanceof Error && error.message.includes("validation") ? 400 : 500
			);
		}
	},
};
