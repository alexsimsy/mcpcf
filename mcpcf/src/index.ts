import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import config from "../config";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Add this at the very top of the file
// console.log("[DEBUG] Worker started");

// At the top of the file, add a global variable for the current token
const currentToken: string | null = null;

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

// Add new interfaces for web access functionality
interface EdgeServiceConfig {
	port: number;
	protocol: 'http' | 'https';
	aclMode: string;
	basicAuthenticationEnabled: boolean;
	username?: string;
	password?: string;
	aclIpAddresses?: string;
}

interface EdgeServicePayload {
	name: string;
	moniker: string;
	instanceConfiguration: EdgeServiceConfig;
	edgeServiceType: string;
	vslice?: string | null;
}

interface RoutingPolicyUpdate {
	edgeServiceInstanceIds: string[];
	moniker: string;
	enabled: boolean;
}

// Add API response interfaces
interface EdgeServiceApiResponse {
	success: boolean;
	messages?: string[];
	data?: any;
}

interface RoutingPolicyApiResponse {
	success: boolean;
	messages?: string[];
	data: {
		edgeServices?: any[];
		[key: string]: any;
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

		// Web Access tool - Create edge service for web access to device
		this.server.tool(
			"webAccess",
			"Create web access to a device via edge service",
			{
				simName: z.string().describe("The name of the SIM to enable web access for"),
				port: z.number().optional().describe("Port number for the far end device (default: 80)"),
				protocol: z.enum(['http', 'https']).optional().describe("Protocol to use (default: http)"),
				enableAuth: z.boolean().optional().describe("Enable username/password authentication (default: false)"),
				username: z.string().optional().describe("Username for authentication (required if enableAuth is true)"),
				password: z.string().optional().describe("Password for authentication (required if enableAuth is true)"),
				allowedIPs: z.string().optional().describe("Comma-separated list of allowed IP addresses or ranges"),
				token: z.string().describe("The authentication token")
			},
			{ group: "Web Access" },
			async ({ simName, port = 80, protocol = 'http', enableAuth = false, username, password, allowedIPs, token }) => {
				if (!token) {
					return {
						content: [
							{ type: "text", text: "Error: No token provided" }
						]
					};
				}

				try {
					// Validate authentication parameters
					if (enableAuth && (!username || !password)) {
						return {
							content: [
								{ type: "text", text: "Error: Username and password are required when authentication is enabled" }
							]
						};
					}

					// Get SIM information to find routing policy moniker
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
					const sim = listData.data.find((s: any) => s.name === simName);
					if (!sim) {
						const availableNames = listData.data.map((s: any) => s.name).join(', ');
						throw new Error(`No SIM found with name: ${simName}. Available SIM names: ${availableNames}`);
					}

					// Get detailed SIM information to access routing policy
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

					// Extract routing policy moniker
					const routingPolicyMoniker = detailData.data.routingPolicyId;
					if (!routingPolicyMoniker) {
						throw new Error('No routing policy found for this SIM. Please check if the SIM has an active routing policy configured.');
					}

					// Generate unique name and moniker for edge service
					const uniqueName = generateUniqueName();
					const uniqueMoniker = uniqueName; // Use same value for both name and moniker

					// Prepare edge service configuration
					const instanceConfig: EdgeServiceConfig = {
						port,
						protocol,
						aclMode: allowedIPs ? "allow" : "",
						basicAuthenticationEnabled: enableAuth
					};

					if (enableAuth && username && password) {
						instanceConfig.username = username;
						instanceConfig.password = password;
					}

					if (allowedIPs) {
						instanceConfig.aclIpAddresses = allowedIPs;
					}

					// Create edge service payload
					const edgeServicePayload: EdgeServicePayload = {
						name: uniqueName,
						moniker: uniqueMoniker,
						instanceConfiguration: instanceConfig,
						edgeServiceType: "remoteaccessproxy"
					};

					// Only add vslice if it has a value
					// For now, we're not using vslice, so we omit it entirely

					// Create edge service
					const edgeServiceResponse = await fetch('https://api.s-imsy.com/api/v1/edgeservices', {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(edgeServicePayload)
					});

					if (!edgeServiceResponse.ok) {
						const errorText = await edgeServiceResponse.text();
						throw new Error(`Edge service creation failed with status ${edgeServiceResponse.status}: ${errorText}`);
					}

					const edgeServiceResult = await edgeServiceResponse.json() as EdgeServiceApiResponse;
					if (!edgeServiceResult.success) {
						throw new Error(edgeServiceResult.messages?.join(', ') || 'Edge service creation failed');
					}

					// Get current routing policy
					const routingPolicyResponse = await fetch(`https://api.s-imsy.com/api/v1/routingpolicies/${routingPolicyMoniker}`, {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!routingPolicyResponse.ok) {
						throw new Error(`Failed to get routing policy with status ${routingPolicyResponse.status}`);
					}

					const routingPolicyData = await routingPolicyResponse.json() as RoutingPolicyApiResponse;
					if (!routingPolicyData.success) {
						throw new Error(routingPolicyData.messages?.join(', ') || 'Failed to get routing policy');
					}

					// Update routing policy to enable the new edge service
					const currentPolicy = routingPolicyData.data;
					console.log('Current routing policy structure:', JSON.stringify(currentPolicy, null, 2));
					
					// Find the existing remoteaccessproxy service in the routingPolicyEdgeServices array
					const existingServiceIndex = currentPolicy.routingPolicyEdgeServices?.findIndex((service: any) => service.moniker === 'remoteaccessproxy') ?? -1;
					
					if (existingServiceIndex >= 0 && currentPolicy.routingPolicyEdgeServices) {
						// Update existing remoteaccessproxy service
						const existingService = currentPolicy.routingPolicyEdgeServices[existingServiceIndex];
						console.log('Found existing remoteaccessproxy service:', JSON.stringify(existingService, null, 2));
						
						// Ensure the service is enabled
						if (existingService.enabled !== true) {
							existingService.enabled = true;
						}
						
						// Initialize arrays if they don't exist
						if (!existingService.edgeServiceInstanceIds) {
							existingService.edgeServiceInstanceIds = [];
						}
						if (!existingService.edgeServiceInstances) {
							existingService.edgeServiceInstances = [];
						}
						
						// Add our new edge service moniker to the IDs array if not already present
						if (!existingService.edgeServiceInstanceIds.includes(uniqueMoniker)) {
							existingService.edgeServiceInstanceIds.push(uniqueMoniker);
						}
						
						// Add our new edge service instance to the instances array if not already present
						const instanceExists = existingService.edgeServiceInstances.some((instance: any) => instance.moniker === uniqueMoniker);
						if (!instanceExists) {
							existingService.edgeServiceInstances.push({
								id: uniqueMoniker,
								moniker: uniqueMoniker
							});
						}
						
						// Set hasMultipleInstances to true if we have multiple instances
						if (existingService.edgeServiceInstanceIds.length > 1) {
							existingService.hasMultipleInstances = true;
						}
						
						// Set hasInstance to true if we have any instances
						if (existingService.edgeServiceInstanceIds.length > 0) {
							existingService.hasInstance = true;
						}
						
						console.log('Updated remoteaccessproxy service:', JSON.stringify(existingService, null, 2));
					} else {
						// If no existing remoteaccessproxy service found, throw an error
						throw new Error('No existing remoteaccessproxy service found in routing policy. Cannot create new service.');
					}

					// Update routing policy
					const cleanPolicy = removeNullValues(currentPolicy);
					
					// Comprehensive cleanup of routing policy to prevent validation errors
					const finalPolicy = cleanRoutingPolicy(cleanPolicy);
					
					// Create the update payload with only the necessary fields
					const updatePayload = {
						...finalPolicy,
						edgeServices: currentPolicy.edgeServices,
						enabled: true // Ensure the routing policy itself is enabled
					};
					
					console.log('Routing policy update payload:', JSON.stringify(updatePayload, null, 2));
					
					const updatePolicyResponse = await fetch(`https://api.s-imsy.com/api/v1/routingpolicies/${routingPolicyMoniker}`, {
						method: 'PUT',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(updatePayload)
					});

					if (!updatePolicyResponse.ok) {
						const errorText = await updatePolicyResponse.text();
						console.log('Routing policy update failed. Status:', updatePolicyResponse.status);
						console.log('Error response:', errorText);
						throw new Error(`Routing policy update failed with status ${updatePolicyResponse.status}: ${errorText}`);
					}

					const updateResult = await updatePolicyResponse.json() as EdgeServiceApiResponse;
					console.log('Routing policy update result:', JSON.stringify(updateResult, null, 2));
					
					if (!updateResult.success) {
						throw new Error(updateResult.messages?.join(', ') || 'Routing policy update failed');
					}

					// Generate access URL using the correct format: https://UNIQUENAME-EPID.remoteaccess.mobi
					const accessUrl = `https://${uniqueName}-${detailData.data.epid}.remoteaccess.mobi`;

					return {
						content: [
							{
								type: "text",
								text: `Web access successfully created for SIM '${simName}'!

Access URL: ${accessUrl}
Edge Service Name: ${uniqueName}
Edge Service Moniker: ${uniqueMoniker}
Port: ${port}
Protocol: ${protocol}
Authentication: ${enableAuth ? 'Enabled' : 'Disabled'}
IP Restrictions: ${allowedIPs ? allowedIPs : 'None'}

Use the 'endWebAccess' tool with the edge service moniker to disable access when done.`
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error creating web access: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// End Web Access tool - Remove web access by disabling and deleting edge service
		this.server.tool(
			"endWebAccess",
			"Remove web access by disabling and deleting the edge service",
			{
				simName: z.string().describe("The name of the SIM to remove web access from"),
				edgeServiceMoniker: z.string().describe("The moniker of the edge service to remove"),
				token: z.string().describe("The authentication token")
			},
			{ group: "Web Access" },
			async ({ simName, edgeServiceMoniker, token }) => {
				if (!token) {
					return {
						content: [
							{ type: "text", text: "Error: No token provided" }
						]
					};
				}

				try {
					// Get all SIMs to find the specific one
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

					// Find the specific SIM with the matching name
					const targetSim = listData.data.find((s: any) => s.name === simName);
					if (!targetSim) {
						const availableNames = listData.data.map((s: any) => s.name).join(', ');
						throw new Error(`No SIM found with name: ${simName}. Available SIM names: ${availableNames}`);
					}

					console.log(`Found target SIM: ${targetSim.name} (ID: ${targetSim.id})`);

					// Get detailed SIM information to access routing policy
					const detailResponse = await fetch(`https://api.s-imsy.com/api/v1/endpoints/${targetSim.id}`, {
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

					// Extract routing policy ID
					const routingPolicyId = detailData.data.routingPolicyId;
					if (!routingPolicyId) {
						throw new Error('No routing policy found for this SIM. Please check if the SIM has an active routing policy configured.');
					}

					console.log(`Processing routing policy ${routingPolicyId} for SIM ${targetSim.name}`);
					
					// Get current routing policy
					const routingPolicyResponse = await fetch(`https://api.s-imsy.com/api/v1/routingpolicies/${routingPolicyId}`, {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!routingPolicyResponse.ok) {
						throw new Error(`Failed to get routing policy with status ${routingPolicyResponse.status}`);
					}

					const routingPolicyData = await routingPolicyResponse.json() as RoutingPolicyApiResponse;
					if (!routingPolicyData.success) {
						throw new Error(routingPolicyData.messages?.join(', ') || 'Failed to get routing policy');
					}

					const currentPolicy = routingPolicyData.data;
					console.log(`Current routing policy structure for ${targetSim.name}:`, JSON.stringify(currentPolicy, null, 2));
					
					// Find the existing remoteaccessproxy service in the routingPolicyEdgeServices array
					const existingServiceIndex = currentPolicy.routingPolicyEdgeServices?.findIndex((service: any) => service.moniker === 'remoteaccessproxy') ?? -1;
					
					if (existingServiceIndex >= 0 && currentPolicy.routingPolicyEdgeServices) {
						const existingService = currentPolicy.routingPolicyEdgeServices[existingServiceIndex];
						console.log(`Found existing remoteaccessproxy service for ${targetSim.name}:`, JSON.stringify(existingService, null, 2));
						
						// First, find the edge service ID by matching the moniker in edgeServiceInstances
						let edgeServiceId: string | null = null;
						if (existingService.edgeServiceInstances) {
							const instance = existingService.edgeServiceInstances.find((instance: any) => instance.moniker === edgeServiceMoniker);
							if (instance) {
								edgeServiceId = instance.id;
								console.log(`Found edge service ID ${edgeServiceId} for moniker ${edgeServiceMoniker}`);
							}
						}
						
						if (!edgeServiceId) {
							console.log(`No edge service instance found with moniker ${edgeServiceMoniker} for ${targetSim.name}`);
						} else {
							// Remove the edge service ID from edgeServiceInstanceIds array
							if (existingService.edgeServiceInstanceIds) {
								const indexToRemove = existingService.edgeServiceInstanceIds.indexOf(edgeServiceId);
								if (indexToRemove >= 0) {
									existingService.edgeServiceInstanceIds.splice(indexToRemove, 1);
									console.log(`Removed edge service ID ${edgeServiceId} from edgeServiceInstanceIds for ${targetSim.name}`);
								}
							}
							
							// Remove the edge service instance from edgeServiceInstances array
							if (existingService.edgeServiceInstances) {
								const instanceIndexToRemove = existingService.edgeServiceInstances.findIndex((instance: any) => instance.id === edgeServiceId);
								if (instanceIndexToRemove >= 0) {
									existingService.edgeServiceInstances.splice(instanceIndexToRemove, 1);
									console.log(`Removed edge service instance with ID ${edgeServiceId} from edgeServiceInstances for ${targetSim.name}`);
								}
							}
							
							// Handle the singular edgeServiceInstanceId field
							if (existingService.edgeServiceInstanceId === edgeServiceId) {
								// If this was the only instance, clear the singular field
								if (!existingService.edgeServiceInstanceIds || existingService.edgeServiceInstanceIds.length === 0) {
									delete existingService.edgeServiceInstanceId;
									console.log(`Cleared edgeServiceInstanceId for ${targetSim.name} - no instances remaining`);
								} else {
									// If there are other instances, set it to the first remaining one
									existingService.edgeServiceInstanceId = existingService.edgeServiceInstanceIds[0];
									console.log(`Updated edgeServiceInstanceId to ${existingService.edgeServiceInstanceIds[0]} for ${targetSim.name}`);
								}
							}
							
							// Update hasMultipleInstances and hasInstance flags
							if (existingService.edgeServiceInstanceIds && existingService.edgeServiceInstanceIds.length > 1) {
								existingService.hasMultipleInstances = true;
							} else {
								existingService.hasMultipleInstances = false;
							}
							
							if (existingService.edgeServiceInstanceIds && existingService.edgeServiceInstanceIds.length > 0) {
								existingService.hasInstance = true;
							} else {
								existingService.hasInstance = false;
							}
							
							// Set enabled to false if there are no other edge service instances
							if (!existingService.edgeServiceInstanceIds || existingService.edgeServiceInstanceIds.length === 0) {
								existingService.enabled = false;
								console.log(`Disabled remoteaccessproxy service for ${targetSim.name} - no instances remaining`);
							}
							
							console.log(`Updated remoteaccessproxy service for ${targetSim.name}:`, JSON.stringify(existingService, null, 2));
						}
						
						// Update routing policy
						const cleanPolicy = removeNullValues(currentPolicy);
						
						// Comprehensive cleanup of routing policy to prevent validation errors
						const finalPolicy = cleanRoutingPolicy(cleanPolicy);
						
						// Create the update payload with only the necessary fields
						const updatePayload = {
							...finalPolicy,
							edgeServices: currentPolicy.edgeServices,
							enabled: true // Ensure the routing policy itself is enabled
						};
						
						console.log(`Routing policy update payload for ${targetSim.name}:`, JSON.stringify(updatePayload, null, 2));
						
						const updatePolicyResponse = await fetch(`https://api.s-imsy.com/api/v1/routingpolicies/${routingPolicyId}`, {
							method: 'PUT',
							headers: {
								'Authorization': `Bearer ${token}`,
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(updatePayload)
						});

						if (!updatePolicyResponse.ok) {
							const errorText = await updatePolicyResponse.text();
							console.log(`Routing policy update failed for ${targetSim.name}. Status:`, updatePolicyResponse.status);
							console.log('Error response:', errorText);
							throw new Error(`Routing policy update failed for ${targetSim.name} with status ${updatePolicyResponse.status}: ${errorText}`);
						}

						const updateResult = await updatePolicyResponse.json() as EdgeServiceApiResponse;
						console.log(`Routing policy update result for ${targetSim.name}:`, JSON.stringify(updateResult, null, 2));
						
						if (!updateResult.success) {
							throw new Error(updateResult.messages?.join(', ') || `Routing policy update failed for ${targetSim.name}`);
						}
						
						console.log(`Successfully updated routing policy for ${targetSim.name}`);
					} else {
						console.log(`No remoteaccessproxy service found in routing policy for ${targetSim.name}`);
					}

					// Delete the edge service
					console.log(`Deleting edge service: ${edgeServiceMoniker}`);
					const deleteResponse = await fetch(`https://api.s-imsy.com/api/v1/edgeservices/${edgeServiceMoniker}`, {
						method: 'DELETE',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						}
					});

					if (!deleteResponse.ok) {
						const errorText = await deleteResponse.text();
						throw new Error(`Edge service deletion failed with status ${deleteResponse.status}: ${errorText}`);
					}

					return {
						content: [
							{
								type: "text",
								text: `Web access successfully removed!

Device: ${targetSim.name}
Edge Service Moniker: ${edgeServiceMoniker}
Status: Deleted

The edge service has been removed from the routing policy and deleted.`
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error removing web access: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);
	}
}

// Helper function to generate unique random names
function generateUniqueName(): string {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.random().toString(36).substring(2, 8);
	return `webaccess_${timestamp}_${randomPart}`;
}

// Helper function to remove null values from objects recursively
function removeNullValues(obj: any): any {
	if (obj === null || obj === undefined) {
		return undefined;
	}
	
	if (Array.isArray(obj)) {
		return obj.map(removeNullValues).filter(item => item !== undefined);
	}
	
	if (typeof obj === 'object') {
		const cleaned: any = {};
		for (const [key, value] of Object.entries(obj)) {
			const cleanedValue = removeNullValues(value);
			if (cleanedValue !== undefined) {
				cleaned[key] = cleanedValue;
			}
		}
		return cleaned;
	}
	
	return obj;
}

// Comprehensive cleanup function for routing policies to prevent validation errors
function cleanRoutingPolicy(policy: any): any {
	if (!policy || typeof policy !== 'object') {
		return policy;
	}
	
	const cleaned = { ...policy };
	
	// Remove problematic top-level fields that should be strings but might be objects
	const stringFields = [
		'routingPolicyStatus', 'vslice', 'moniker', 'name', 'description',
		'endpointGroupId', 'endpointGroupName', 'steeringProfileId', 'steeringProfileName',
		'vSliceId', 'vSliceName', 'vSliceMoniker', 'eventMapId', 'eventMapName',
		'regionalGatewayPolicyId', 'regionalGatewayPolicyName'
	];
	
	stringFields.forEach(field => {
		if (cleaned[field] && typeof cleaned[field] !== 'string') {
			// If it's an object with a moniker property, use that
			if (cleaned[field] && typeof cleaned[field] === 'object' && cleaned[field].moniker) {
				cleaned[field] = cleaned[field].moniker;
			} else {
				// Otherwise remove it
				delete cleaned[field];
			}
		}
	});
	
	// Clean up routingPolicyRules array
	if (cleaned.routingPolicyRules && Array.isArray(cleaned.routingPolicyRules)) {
		cleaned.routingPolicyRules = cleaned.routingPolicyRules.map((rule: any) => {
			if (rule && typeof rule === 'object') {
				const cleanedRule = { ...rule };
				
				// Remove or convert ALL rule fields that should be strings
				// This is a comprehensive list of all possible rule fields
				const ruleStringFields = [
					'ruleAction', 'ruleCondition', 'ruleType', 'ruleDirection',
					'ruleName', 'ruleDescription', 'ruleMoniker', 'routingTarget',
					'rulePriority', 'ruleStatus', 'ruleCategory', 'ruleSubcategory'
				];
				
				ruleStringFields.forEach(field => {
					if (cleanedRule[field] && typeof cleanedRule[field] !== 'string') {
						if (cleanedRule[field] && typeof cleanedRule[field] === 'object' && cleanedRule[field].moniker) {
							cleanedRule[field] = cleanedRule[field].moniker;
						} else {
							delete cleanedRule[field];
						}
					}
				});
				
				// Also handle any other fields that might be objects instead of primitives
				Object.keys(cleanedRule).forEach(key => {
					const value = cleanedRule[key];
					if (value && typeof value === 'object' && !Array.isArray(value)) {
						// If it's an object with a moniker, use the moniker
						if (value.moniker) {
							cleanedRule[key] = value.moniker;
						} else if (value.name) {
							cleanedRule[key] = value.name;
						} else if (value.id) {
							cleanedRule[key] = value.id;
						} else {
							// If we can't convert it to a string, remove it
							delete cleanedRule[key];
						}
					}
				});
				
				return cleanedRule;
			}
			return rule;
		});
	}
	
	// Clean up edgeServices array
	if (cleaned.edgeServices && Array.isArray(cleaned.edgeServices)) {
		cleaned.edgeServices = cleaned.edgeServices.map((service: any) => {
			if (service && typeof service === 'object') {
				const cleanedService = { ...service };
				
				// Remove or convert service fields that should be strings
				const serviceStringFields = [
					'moniker', 'name', 'description', 'edgeServiceType'
				];
				
				serviceStringFields.forEach(field => {
					if (cleanedService[field] && typeof cleanedService[field] !== 'string') {
						if (cleanedService[field] && typeof cleanedService[field] === 'object' && cleanedService[field].moniker) {
							cleanedService[field] = cleanedService[field].moniker;
						} else {
							delete cleanedService[field];
						}
					}
				});
				
				return cleanedService;
			}
			return service;
		});
	}
	
	return cleaned;
}

// CORS headers configuration
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id",
};

// Helper function to create error response
function createErrorResponse(message: string, status = 400) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"Content-Type": "application/json",
			...corsHeaders,
		},
	});
}

// Helper function to create success response
function createSuccessResponse(data: any, status = 200) {
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
				for (const [key, value] of Object.entries(corsHeaders)) {
					headers.set(key, value);
				}
				
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
				for (const [key, value] of Object.entries(corsHeaders)) {
					responseHeaders.set(key, value);
				}

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