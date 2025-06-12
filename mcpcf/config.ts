import { z } from "zod";

// Configuration schema
const configSchema = z.object({
    token: z.string().min(1, "Token is required"),
    // Add other configuration options here as needed
});

// Default configuration
const defaultConfig = {
    token: "36099e83901c4753a7a6e786f98ba72e", // Default test token
};

// Load configuration from environment or use defaults
export const config = {
    ...defaultConfig,
    ...(process.env.MCP_CONFIG ? JSON.parse(process.env.MCP_CONFIG) : {}),
};

// Validate configuration
try {
    configSchema.parse(config);
} catch (error) {
    console.error("Invalid configuration:", error);
    process.exit(1);
}

export default config; 