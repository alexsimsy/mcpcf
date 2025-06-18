import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import config from "../config";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Add this at the very top of the file
// console.log("[DEBUG] Worker started");

// At the top of the file, add a global variable for the current token
let currentToken: string | null = null;

// Token verification schema
const tokenSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

interface NetworkStatus {
	moniker: string;
	name: string;
	active: boolean;
}

interface SimItem {
	id: string;
	name: string;
	endpointNetworkStatus: NetworkStatus;
}

interface ApiResponse {
	success: boolean;
	messages: string[];
	totalItems: number;
	data: SimItem[];
}

interface DetailApiResponse {
	success: boolean;
	messages: string[];
	data: any;
}

// At the top of the file, add a request-scoped context interface
interface RequestContext {
	token: string | null;
}

// Update the ToolArgs interface to match the MCP request structure
interface ToolArgs {
	_meta?: { progressToken: number };
	name?: string;
	arguments?: Record<string, any>;
	context?: {
		token?: string;
	};
}

// Add this interface after the existing interfaces
interface CallToolRequest {
	params: {
		name: string;
		arguments: Record<string, any>;
		context?: {
			token?: string;
		};
	};
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Get SIMs information tool
		this.server.tool(
			"getSims",
			"Get a list of all SIMs with their basic information",
			{
				token: z.string().describe("The authentication token")
			},
			{ group: "General" },
			async ({ token }) => {
				// console.log(`[DEBUG] ===== getSims tool called =====`);
				// console.log(`[DEBUG] Token from arguments:`, token);
				
				if (!token) {
					// console.log(`[DEBUG] No token available in getSims tool`);
					return {
						content: [
							{
								type: "text",
								text: "Error: No token provided"
							}
						]
					};
				}
				
				try {
					// console.log(`[DEBUG] Making API request with token:`, token);
					const response = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});
					// console.log(`[DEBUG] API response status:`, response.status);
					const data = await response.json() as ApiResponse;
					// console.log(`[DEBUG] API response data:`, data);
					
					if (!data.success) {
						throw new Error(data.messages.join(', '));
					}
					
					const sims = data.data.map((sim: SimItem) => ({
						id: sim.id,
						name: sim.name,
						status: sim.endpointNetworkStatus.name
					}));
					
					// console.log(`[DEBUG] Processed SIMs data:`, sims);
					return {
						content: [
							{
								type: "text",
								text: `Total SIMs: ${data.totalItems}\n\nSIM Details:\n${JSON.stringify(sims, null, 2)}`
							}
						]
					};
				} catch (error) {
					// console.error(`[DEBUG] Error in getSims:`, error);
					return {
						content: [
							{
								type: "text",
								text: `Error retrieving SIM information: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// Send SMS to a SIM tool
		this.server.tool(
			"sendSms",
			"Send an SMS message to a SIM card",
			{
				name: z.string().describe("The name of the SIM to send the SMS to"),
				payloadText: z.string().describe("The SMS message to send"),
				token: z.string().describe("The authentication token")
			},
			{ group: "General" },
			async ({ name, payloadText, token }) => {
				// console.log(`[DEBUG] ===== sendSms tool called =====`);
				// console.log(`[DEBUG] Token from arguments:`, token);
				if (!token) {
					return {
						content: [
							{ type: "text", text: "Error: No token provided" }
						]
					};
				}
				try {
					// Fetch SIMs for this token
					const listResponse = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});
					if (!listResponse.ok) {
						throw new Error(`API request failed with status ${listResponse.status}`);
					}
					const listData = await listResponse.json() as ApiResponse;
					if (!listData.success) {
						throw new Error(listData.messages.join(', '));
					}
					// Find the SIM with the matching name
					const sim = listData.data.find((s: any) => s.name === name);
					if (!sim) {
						const availableNames = listData.data.map((s: any) => s.name).join(', ');
						throw new Error(`No SIM found with name: ${name}. Available SIM names: ${availableNames}`);
					}
					// Send the SMS message
					const smsResponse = await fetch(`https://api.s-imsy.com/api/v1/endpoints/${sim.id}/sms`, {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							payloadText,
							protocolId: 0,
							dataCodingScheme: 0
						})
					});
					if (!smsResponse.ok) {
						const errorText = await smsResponse.text();
						throw new Error(`SMS API request failed with status ${smsResponse.status}: ${errorText}`);
					}
					const smsResult = await smsResponse.json();
					return {
						content: [
							{
								type: "text",
								text: `SMS sent to SIM '${name}' (ID: ${sim.id}). API response: ${JSON.stringify(smsResult, null, 2)}`
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error sending SMS: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// Get detailed SIM information tool
		this.server.tool(
			"getSimInfo",
			"Get detailed information about a specific SIM",
			{
				name: z.string().describe("The name of the SIM to get information for"),
				token: z.string().describe("The authentication token")
			},
			{ group: "General" },
			async ({ name, token }) => {
				// console.log(`[DEBUG] ===== getSimDetails tool called =====`);
				// console.log(`[DEBUG] Token from arguments:`, token);
				if (!token) {
					return {
						content: [
							{ type: "text", text: "Error: No token provided" }
						]
					};
				}
				try {
					// Fetch SIMs for this token
					const listResponse = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});
					if (!listResponse.ok) {
						throw new Error(`API request failed with status ${listResponse.status}`);
					}
					const listData = await listResponse.json() as ApiResponse;
					if (!listData.success) {
						throw new Error(listData.messages.join(', '));
					}
					// Find the SIM with the matching name
					const sim = listData.data.find((s: any) => s.name === name);
					if (!sim) {
						const availableNames = listData.data.map((s: any) => s.name).join(', ');
						throw new Error(`No SIM found with name: ${name}. Available SIM names: ${availableNames}`);
					}
					// Get detailed information for the specific SIM
					const detailResponse = await fetch(`https://api.s-imsy.com/api/v1/endpoints/${sim.id}`, {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});
					if (!detailResponse.ok) {
						throw new Error(`API request failed with status ${detailResponse.status}`);
					}
					const detailData = await detailResponse.json() as DetailApiResponse;
					if (!detailData.success) {
						throw new Error(detailData.messages.join(', '));
					}
					// Format and return SIM details
					const bytesToMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
					const simInfo = {
						latestActivity: detailData.data.latestActivity,
						endpointStatus: detailData.data.endpointStatus.active,
						endpointNetworkStatus: detailData.data.endpointNetworkStatus.active,
						latestRatType: detailData.data.latestRatType.name,
						latestServingOperatorDescription: detailData.data.latestServingOperatorDescription,
						latestCountryName: detailData.data.latestCountryName,
						usageRolling24H: `${bytesToMB(detailData.data.usageRolling24H)} MB`,
						usageRolling7D: `${bytesToMB(detailData.data.usageRolling7D)} MB`,
						usageRolling28D: `${bytesToMB(detailData.data.usageRolling28D)} MB`
					};
					return {
						content: [
							{
								type: "text",
								text: `SIM Information for ${name}:\n${JSON.stringify(simInfo, null, 2)}`
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error retrieving SIM information: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);
	}
}

// CORS headers configuration
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id",
};

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

// Helper function to verify token
async function verifyToken(token: string): Promise<boolean> {
	try {
		// console.log('[DEBUG] Verifying token:', token);
		const headers = {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json"
		};
		// console.log('[DEBUG] Headers sent to API:', headers);
		const response = await fetch("https://api.s-imsy.com/api/v1/apitokens/verify", {
			method: "GET",
			headers
		});
		const responseBody = await response.text();
		// console.log('[DEBUG] API response status:', response.status);
		// console.log('[DEBUG] API response body:', responseBody);
		return response.ok;
	} catch (error) {
		// console.error("Token verification error:", error);
		return false;
	}
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

// Helper to get token from X-Forwarded-Token header
function getTokenFromRequest(request: Request): string | null {
	return request.headers.get("X-Forwarded-Token");
}

// TypeScript Env type for Cloudflare bindings
interface Env {
	// No bindings needed
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		// console.log("[DEBUG] Received request:", request.method, request.url);
		// Debug: Log all incoming requests
		// console.log(`[DEBUG] ${request.method} ${new URL(request.url).pathname}`);
		// console.log(`[DEBUG] Headers:`, Object.fromEntries(request.headers.entries()));

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

			// SSE endpoints
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				const token = await extractToken(request);
				if (!token) {
					return createErrorResponse("No token provided", 401);
				}
				const isValid = await verifyToken(token);
				if (!isValid) {
					return createErrorResponse("Invalid token", 401);
				}
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

			// Stream endpoint with proper SSE formatting
			if (url.pathname === "/stream") {
				const token = await extractToken(request);
				if (!token) {
					return createErrorResponse("No token provided", 401);
				}
				const isValid = await verifyToken(token);
				if (!isValid) {
					return createErrorResponse("Invalid token", 401);
				}

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

			// MCP endpoint
			if (url.pathname === "/mcp") {
				// console.log(`[DEBUG] ===== Starting new MCP request =====`);
				let body: any = undefined;
				if (request.method === 'POST') {
					body = await request.json();
					// console.log(`[DEBUG] Original request body:`, body);
					
					// Extract and validate token first
					const token = await extractToken(request);
					// console.log(`[DEBUG] Extracted token from request:`, token);
					if (!token) {
						// console.log(`[DEBUG] No token provided, returning 401`);
						return createErrorResponse("No token provided", 401);
					}
					const isValid = await verifyToken(token);
					// console.log(`[DEBUG] Token validation result:`, isValid);
					if (!isValid) {
						// console.log(`[DEBUG] Invalid token, returning 401`);
						return createErrorResponse("Invalid token", 401);
					}

					// If this is a tool call, inject the token into the arguments
					if (body.method === 'tools/call' && body.params) {
						if (!body.params.arguments) {
							body.params.arguments = {};
						}
						body.params.arguments.token = token;
						// console.log(`[DEBUG] Modified request body with token in arguments:`, body);
					}
				}

				// Re-create the request with the modified body
				const newRequest = new Request(request.url, {
					method: request.method,
					headers: request.headers,
					body: JSON.stringify(body)
				});

				// console.log(`[DEBUG] Creating MCP handler`);
				const mcpHandler = MyMCP.serve("/mcp");
				// console.log(`[DEBUG] Calling MCP handler with token in arguments`);
				const response = await mcpHandler.fetch(newRequest, env, ctx);

				// Add CORS headers to MCP response
				const responseHeaders = new Headers(response.headers);
				Object.entries(corsHeaders).forEach(([key, value]) => {
					responseHeaders.set(key, value);
				});

				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: responseHeaders,
				});
			}

			// Not found response
			return createErrorResponse("Not found", 404);
		} catch (error) {
			// Log the error
			// console.error("Error processing request:", error);
			
			// Return error response
			return createErrorResponse(
				error instanceof Error ? error.message : "Internal server error",
				error instanceof Error && error.message.includes("validation") ? 400 : 500
			);
		}
	},
};
