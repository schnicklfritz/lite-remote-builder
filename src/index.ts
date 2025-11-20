#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// CONFIG: Credentials from Environment Variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_USER; 
const REPO = process.env.GITHUB_REPO;

// Initialize Server
const server = new Server(
  { name: "lite-remote-builder", version: "3.1.0" },
  { capabilities: { tools: {} } }
);

// Helper function for generic GitHub API requests
async function githubRequest(endpoint: string, options: any = {}) {
  if (!GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN env var");
  
  const url = `https://api.github.com/repos/${OWNER}/${REPO}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
  return response.json();
}

// Define the Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "trigger_kernel_build",
        description: "Triggers the GitHub Action workflow to compile the Custom Arch Kernel.",
        inputSchema: z.object({
          ref: z.string().default("main").describe("The branch to build (default: main)"),
        }),
      },
      {
        name: "check_build_status",
        description: "Checks the status of recent GitHub Actions builds.",
        inputSchema: z.object({
          limit: z.number().default(1),
        }),
      },
    ],
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "trigger_kernel_build") {
      const ref = String(args?.ref || "main");

      // 1. Construct the URL for the KERNEL workflow
      const workflowFile = "kernel-build.yml"; 
      const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowFile}/dispatches`;

      // 2. Send the Dispatch Event
      await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
        },
        // Note: We don't need 'inputs' anymore for the kernel build, just the branch ref
        body: JSON.stringify({ ref }) 
      });

      return {
        content: [{ type: "text", text: `🚀 Signal sent! GitHub is now building your Kernel from branch '${ref}'.` }],
      };
    }

    if (name === "check_build_status") {
      const limit = args?.limit || 1;
      const data: any = await githubRequest(`/actions/runs?per_page=${limit}`);
      
      // Format the output nicely
      const runs = data.workflow_runs.map((r:any) => 
        `• [${r.status}] ${r.name} (#${r.run_number}): ${r.conclusion || "In Progress..."}\n  URL: ${r.html_url}`
      );
      
      return {
        content: [{ type: "text", text: runs.length ? runs.join("\n") : "No recent builds found." }],
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// Start the Server
const transport = new StdioServerTransport();
await server.connect(transport);
