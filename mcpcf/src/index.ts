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
		// Get SIMs information tool
		this.server.tool(
			"getSims",
			"Get a list of all SIMs with their basic information",
			{},
			{ group: "General" },
			async () => {
				try {
					const response = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
						headers: {
							'Authorization': `Bearer ${config.token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!response.ok) {
						throw new Error(`API request failed with status ${response.status}`);
					}

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

					const data = await response.json() as ApiResponse;
					
					if (!data.success) {
						throw new Error(data.messages.join(', '));
					}

					const sims = data.data.map((sim) => ({
						id: sim.id,
						name: sim.name,
						status: sim.endpointNetworkStatus.name
					}));

					return {
						content: [
							{
								type: "text",
								text: `Total SIMs: ${data.totalItems}\n\nSIM Details:\n${JSON.stringify(sims, null, 2)}`
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

		// Fetch SIM names for dropdown
		let simNames: string[] = [];
		try {
			const response = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
				headers: {
					'Authorization': `Bearer ${config.token}`,
					'Content-Type': 'application/json'
				}
			});
			if (response.ok) {
				interface SimListItem { id: string; name: string; }
				interface ListApiResponse { success: boolean; messages: string[]; data: SimListItem[]; }
				const data = await response.json() as ListApiResponse;
				if (data.success && Array.isArray(data.data)) {
					simNames = data.data.map((sim) => sim.name).filter((name) => typeof name === 'string');
				}
			}
		} catch (e) {
			// If fetching SIM names fails, fallback to string input
		}

		// Send SMS to a SIM tool
		this.server.tool(
			"sendSms",
			"Send an SMS message to a SIM card",
			{
				name: simNames.length > 0
					? z.enum([...simNames] as [string, ...string[]]).describe("The name of the SIM to send the SMS to")
					: z.string().describe("The name of the SIM to send the SMS to"),
				payloadText: z.string().describe("The SMS message to send")
			},
			{ group: "General" },
			async ({ name, payloadText }) => {
				try {
					// First, get all SIMs to find the ID for the given name
					const listResponse = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
						headers: {
							'Authorization': `Bearer ${config.token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!listResponse.ok) {
						throw new Error(`API request failed with status ${listResponse.status}`);
					}

					interface SimListItem {
						id: string;
						name: string;
					}

					interface ListApiResponse {
						success: boolean;
						messages: string[];
						data: SimListItem[];
					}

					const listData = await listResponse.json() as ListApiResponse;
					if (!listData.success) {
						throw new Error(listData.messages.join(', '));
					}

					// Find the SIM with the matching name
					const sim = listData.data.find((s) => s.name === name);
					if (!sim) {
						const availableNames = listData.data.map((s) => s.name).join(', ');
						throw new Error(`No SIM found with name: ${name}. Available SIM names: ${availableNames}`);
					}

					// Send the SMS message
					const smsResponse = await fetch(`https://api.s-imsy.com/api/v1/endpoints/${sim.id}/sms`, {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${config.token}`,
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
				name: simNames.length > 0
					? z.enum([...simNames] as [string, ...string[]]).describe("The name of the SIM to get information for")
					: z.string().describe("The name of the SIM to get information for")
			},
			{ group: "General" },
			async ({ name }) => {
				try {
					// First, get all SIMs to find the ID for the given name
					const listResponse = await fetch('https://api.s-imsy.com/api/v1/endpoints', {
						headers: {
							'Authorization': `Bearer ${config.token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!listResponse.ok) {
						throw new Error(`API request failed with status ${listResponse.status}`);
					}

					interface SimListItem {
						id: string;
						name: string;
					}

					interface ListApiResponse {
						success: boolean;
						messages: string[];
						data: SimListItem[];
					}

					const listData = await listResponse.json() as ListApiResponse;
					if (!listData.success) {
						throw new Error(listData.messages.join(', '));
					}

					// Find the SIM with the matching name
					const sim = listData.data.find((s) => s.name === name);
					if (!sim) {
						const availableNames = listData.data.map((s) => s.name).join(', ');
						throw new Error(`No SIM found with name: ${name}. Available SIM names: ${availableNames}`);
					}

					// Get detailed information for the specific SIM
					const detailResponse = await fetch(`https://api.s-imsy.com/api/v1/endpoints/${sim.id}`, {
						headers: {
							'Authorization': `Bearer ${config.token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!detailResponse.ok) {
						throw new Error(`API request failed with status ${detailResponse.status}`);
					}

					interface RatType {
						name: string;
					}

					interface EndpointStatus {
						active: boolean;
					}

					interface SimDetail {
						latestActivity: string;
						endpointStatus: EndpointStatus;
						endpointNetworkStatus: EndpointStatus;
						latestRatType: RatType;
						latestServingOperatorDescription: string;
						latestCountryName: string;
						usageRolling24H: number;
						usageRolling7D: number;
						usageRolling28D: number;
					}

					interface DetailApiResponse {
						success: boolean;
						messages: string[];
						data: SimDetail;
					}

					const detailData = await detailResponse.json() as DetailApiResponse;
					if (!detailData.success) {
						throw new Error(detailData.messages.join(', '));
					}

					// Convert bytes to MB (1 MB = 1024 * 1024 bytes)
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

// TypeScript Env type for Cloudflare bindings
interface Env {
	// No bindings needed
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
				// Debug: Log MCP request
				console.log(`[DEBUG] Handling /mcp request`);
				const token = await extractToken(request);
				console.log(`[DEBUG] Extracted token:`, token);
				if (!token) {
					console.log(`[DEBUG] No token provided, returning 401`);
					return createErrorResponse("No token provided", 401);
				}
				const isValid = await verifyToken(token);
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
