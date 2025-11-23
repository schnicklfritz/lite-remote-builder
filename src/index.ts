#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SocksProxyAgent } from "socks-proxy-agent";

// CONFIGURATION
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_USER;
const REPO = process.env.GITHUB_REPO;

// Hardcoded proxy agent for GitHub requests ONLY
const PROXY_URL = "socks5h://192.168.49.1:8229";
const proxyAgent = new SocksProxyAgent(PROXY_URL);

// Startup check for essential variables
if (!GITHUB_TOKEN || !OWNER || !REPO) {
  throw new Error("Missing required environment variables: GITHUB_TOKEN, GITHUB_USER, GITHUB_REPO");
}

// SERVER INITIALIZATION
const server = new Server(
  { name: "lite-remote-builder", version: "3.3.0" }, // Version bump for hardcoded proxy fix
  { capabilities: { tools: {} } }
);

// HELPER for GitHub API requests, routed through the proxy
async function githubRequest(endpoint: string, options: RequestInit = {}) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}${endpoint}`;

  // Cast to 'any' to satisfy TypeScript's strict DOM-based RequestInit type
  const response = await (fetch as any)(url, {
    ...(options as any),
    agent: proxyAgent, // This Node.js-specific option is the fix
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(options as any).headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API Error [${response.status}]: ${response.statusText}`);
  }
  return response.status === 204 ? null : response.json();
}

// TOOL DEFINITIONS
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "trigger_kernel_build",
        description: "Dispatches a remote CachyOS Kernel build (Haswell-Optimized).",
        inputSchema: z.object({
          ref: z.string().default("main"),
          opt_level: z.enum(["O2", "O3"]).default("O3"),
        }),
      },
      {
        name: "check_build_status",
        description: "Lists recent GitHub Action runs to check build progress.",
        inputSchema: z.object({
          limit: z.number().default(3),
        }),
      },
    ],
  };
});

// TOOL EXECUTION LOGIC
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "trigger_kernel_build") {
      const ref = String(args?.ref || "main");
      const opt_level = String(args?.opt_level || "O3");
      
      await githubRequest(`/actions/workflows/kernel-build.yml/dispatches`, {
        method: "POST",
        body: JSON.stringify({
          ref: ref,
          inputs: { opt_level: opt_level }
        }),
      });
      return { content: [{ type: "text", text: `🚀 DISPATCHED: Building kernel on branch '${ref}' with ${opt_level}.` }] };
    }

    if (name === "check_build_status") {
      const limit = Number(args?.limit || 3);
      const data: any = await githubRequest(`/actions/runs?per_page=${limit}`);
      const statusMsg = data.workflow_runs.map((run: any) => 
        `• [${run.status}] ${run.name} #${run.run_number}: ${run.conclusion || "Running..."}`
      ).join("\n");
      return { content: [{ type: "text", text: statusMsg || "No builds found." }] };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  } catch (error: any) {
    return { content: [{ type: "text", text: `❌ MCP Tool Error: ${error.message}` }], isError: true };
  }
});

// SERVER STARTUP
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Lite Remote Builder MCP Server now running on stdio.");
