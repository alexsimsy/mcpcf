import { MyMCP } from "./src/index";
import config from "./config";

async function testEndpoints() {
    console.log("Starting MCP server tests...\n");

    // Test health endpoint
    console.log("Testing /health endpoint...");
    const healthResponse = await fetch("http://localhost:8787/health");
    const healthData = await healthResponse.json();
    console.log("Health check response:", healthData);
    console.log("Status:", healthResponse.status);
    console.log("Headers:", Object.fromEntries(healthResponse.headers.entries()));
    console.log("\n");

    // Test token verification endpoint
    console.log("Testing /verify-token endpoint...");
    
    // Test with valid token
    console.log("Testing with valid token...");
    const validTokenResponse = await fetch("http://localhost:8787/verify-token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            token: config.token
        })
    });
    const validTokenData = await validTokenResponse.json();
    console.log("Valid token response:", validTokenData);
    console.log("Status:", validTokenResponse.status);
    console.log("Headers:", Object.fromEntries(validTokenResponse.headers.entries()));
    console.log("\n");

    // Test with invalid token
    console.log("Testing with invalid token...");
    const invalidTokenResponse = await fetch("http://localhost:8787/verify-token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            token: "invalid-token"
        })
    });
    const invalidTokenData = await invalidTokenResponse.json();
    console.log("Invalid token response:", invalidTokenData);
    console.log("Status:", invalidTokenResponse.status);
    console.log("Headers:", Object.fromEntries(invalidTokenResponse.headers.entries()));
    console.log("\n");

    // Test with missing token
    console.log("Testing with missing token...");
    const missingTokenResponse = await fetch("http://localhost:8787/verify-token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({})
    });
    const missingTokenData = await missingTokenResponse.json();
    console.log("Missing token response:", missingTokenData);
    console.log("Status:", missingTokenResponse.status);
    console.log("Headers:", Object.fromEntries(missingTokenResponse.headers.entries()));
    console.log("\n");

    // Test SSE endpoint
    console.log("Testing /sse endpoint...");
    const sseResponse = await fetch("http://localhost:8787/sse");
    console.log("SSE Status:", sseResponse.status);
    console.log("SSE Headers:", Object.fromEntries(sseResponse.headers.entries()));
    console.log("\n");

    // Test stream endpoint
    console.log("Testing /stream endpoint...");
    const streamResponse = await fetch("http://localhost:8787/stream");
    console.log("Stream Status:", streamResponse.status);
    console.log("Stream Headers:", Object.fromEntries(streamResponse.headers.entries()));
    
    // Read stream data
    const reader = streamResponse.body?.getReader();
    if (reader) {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            console.log("Stream data:", new TextDecoder().decode(value));
        }
    }
    console.log("\n");

    // Test MCP endpoint with calculator
    console.log("Testing /mcp endpoint with calculator...");
    const mcpResponse = await fetch("http://localhost:8787/mcp", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            tool: "calculate",
            params: {
                operation: "add",
                a: 5,
                b: 3
            }
        })
    });
    const mcpData = await mcpResponse.json();
    console.log("MCP Response:", mcpData);
    console.log("MCP Status:", mcpResponse.status);
    console.log("MCP Headers:", Object.fromEntries(mcpResponse.headers.entries()));
    console.log("\n");

    // Test error handling
    console.log("Testing error handling...");
    const errorResponse = await fetch("http://localhost:8787/nonexistent");
    const errorData = await errorResponse.json();
    console.log("Error Response:", errorData);
    console.log("Error Status:", errorResponse.status);
    console.log("Error Headers:", Object.fromEntries(errorResponse.headers.entries()));
    console.log("\n");

    // Test CORS
    console.log("Testing CORS...");
    const corsResponse = await fetch("http://localhost:8787/health", {
        method: "OPTIONS",
        headers: {
            "Origin": "http://example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type"
        }
    });
    console.log("CORS Status:", corsResponse.status);
    console.log("CORS Headers:", Object.fromEntries(corsResponse.headers.entries()));
}

// Run the tests
testEndpoints().catch(console.error); 