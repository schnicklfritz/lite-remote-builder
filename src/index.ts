#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// 1. CONFIG: Environment Variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_USER;
const REPO = process.env.GITHUB_REPO;

if (!GITHUB_TOKEN || !OWNER || !REPO) {
  throw new Error("Missing required environment variables: GITHUB_TOKEN, GITHUB_USER, GITHUB_REPO");
}

// 2. SERVER INITIALIZATION
const server = new Server(
  { name: "lite-remote-builder", version: "3.2.0" }, // Bumped version for CachyOS support
  { capabilities: { tools: {} } }
);

// 3. HELPERS
async function githubRequest(endpoint: string, options: RequestInit = {}) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API Error [${response.status}]: ${response.statusText} - ${url}`);
  }
  
  // Return JSON if content exists, otherwise null (for 204 No Content)
  return response.status === 204 ? null : response.json();
}

// 4. TOOL DEFINITIONS
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "trigger_kernel_build",
        description: "Dispatches a remote CachyOS Kernel build (Haswell-Optimized + BORE Scheduler).",
        inputSchema: z.object({
          ref: z.string().default("main").describe("Git branch to build from"),
          opt_level: z.enum(["O2", "O3"]).default("O3").describe("GCC optimization level (Default: O3 for speed)"),
        }),
      },
      {
        name: "check_build_status",
        description: "Lists recent GitHub Action runs to check build progress.",
        inputSchema: z.object({
          limit: z.number().default(3).describe("Number of recent runs to show"),
        }),
      },
    ],
  };
});

// 5. TOOL EXECUTION
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // --- Tool: Trigger Build ---
    if (name === "trigger_kernel_build") {
      const ref = String(args?.ref || "main");
      const opt_level = String(args?.opt_level || "O3");

      // We target the specific YAML file we created in the previous step
      const workflowId = "build-kernel.yml"; 

      await githubRequest(`/actions/workflows/${workflowId}/dispatches`, {
        method: "POST",
        body: JSON.stringify({
          ref: ref,
          inputs: {
            opt_level: opt_level // Passes 'O3' to the workflow
          }
        }),
      });

      return {
        content: [{ 
          type: "text", 
          text: `🚀 DISPATCHED: Building Haswell Speed Kernel (CachyOS/BORE/${opt_level}) on branch '${ref}'.\nCheck status with 'check_build_status'.` 
        }],
      };
    }

    // --- Tool: Check Status ---
    if (name === "check_build_status") {
      const limit = Number(args?.limit || 3);
      const data: any = await githubRequest(`/actions/runs?per_page=${limit}`);

      if (!data.workflow_runs || data.workflow_runs.length === 0) {
        return { content: [{ type: "text", text: "No recent builds found." }] };
      }

      const statusMsg = data.workflow_runs.map((run: any) => {
        const icon = run.status === "completed" 
          ? (run.conclusion === "success" ? "✅" : "❌") 
          : "🔄";
        return `${icon} [${run.status}] ${run.name} #${run.run_number}\n   Conclusion: ${run.conclusion || "Running..."}\n   Link: ${run.html_url}`;
      }).join("\n\n");

      return { content: [{ type: "text", text: statusMsg }] };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);

  } catch (error: any) {
    // Catch-all error handler to keep the server alive
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ Error executing '${name}': ${errorMessage}` }],
      isError: true,
    };
  }
});

// 6. STARTUP
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Lite Remote Builder MCP Server running on stdio");
