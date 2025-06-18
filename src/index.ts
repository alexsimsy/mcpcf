import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import config from "../config";
import type { ExecutionContext, KVNamespace } from '@cloudflare/workers-types';
import {
    checkRateLimit,
    checkIPBlock,
    trackFailedAttempt,
    resetFailedAttempts,
    createSecurityErrorResponse
} from "./security";

// Environment interface
interface Env {
    RATE_LIMIT_KV: KVNamespace;
    IP_BLOCK_KV: KVNamespace;
}

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

    // ... existing init() method and tools ...

    // Helper function to verify token
    async verifyToken(token: string): Promise<boolean> {
        return token === config.token;
    }

    // Helper function to extract token from request
    async extractToken(request: Request): Promise<string | null> {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return null;
        }
        return authHeader.slice(7);
    }
}

// Create an instance of MyMCP for handling requests
const mcpInstance = new MyMCP();

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
function createSuccessResponse(data: any) {
    return new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
        },
    });
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
            // Check rate limit and IP block for all non-health endpoints
            if (url.pathname !== "/health") {
                const { isRateLimited, retryAfter } = await checkRateLimit(request, env);
                const { isBlocked, blockReason } = await checkIPBlock(request, env);

                if (isRateLimited || isBlocked) {
                    return createSecurityErrorResponse(isRateLimited, isBlocked, retryAfter, blockReason);
                }
            }

            // Health check endpoint
            if (url.pathname === "/health") {
                return createSuccessResponse({ status: "healthy" });
            }

            // SSE endpoints
            if (url.pathname === "/sse" || url.pathname === "/sse/message") {
                const token = await mcpInstance.extractToken(request);
                if (!token) {
                    await trackFailedAttempt(request, env);
                    return createErrorResponse("No token provided", 401);
                }
                const isValid = await mcpInstance.verifyToken(token);
                if (!isValid) {
                    await trackFailedAttempt(request, env);
                    return createErrorResponse("Invalid token", 401);
                }
                await resetFailedAttempts(request, env);
                const sseHandler = mcpInstance.server.serveSSE("/sse");
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
                const token = await mcpInstance.extractToken(request);
                console.log(`[DEBUG] Extracted token:`, token);
                if (!token) {
                    console.log(`[DEBUG] No token provided, returning 401`);
                    await trackFailedAttempt(request, env);
                    return createErrorResponse("No token provided", 401);
                }
                const isValid = await mcpInstance.verifyToken(token);
                console.log(`[DEBUG] Token valid:`, isValid);
                if (!isValid) {
                    console.log(`[DEBUG] Invalid token, returning 401`);
                    await trackFailedAttempt(request, env);
                    return createErrorResponse("Invalid token", 401);
                }
                await resetFailedAttempts(request, env);
                const mcpHandler = mcpInstance.server.serve("/mcp");
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
    }
}; 