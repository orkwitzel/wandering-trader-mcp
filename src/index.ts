import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Database } from "bun:sqlite";
import { initSchema } from "./db/schema";
import { createService, type Service } from "./service";
import { registerSessionTools } from "./mcp/tools/session";
import { registerCityTools } from "./mcp/tools/city";
import { registerTravelTools } from "./mcp/tools/travel";
import { registerEncounterTools } from "./mcp/tools/encounter";
import { registerEndTools } from "./mcp/tools/end";

const TRANSPORT = process.env.MCP_TRANSPORT ?? "stdio";
const DB_PATH = process.env.WANDERING_TRADER_DB ?? "wandering-trader.db";
const PORT = Number(process.env.PORT ?? 8080);
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const db = new Database(DB_PATH, { create: true });
initSchema(db);
const svc = createService(db);

function buildServer(svc: Service): McpServer {
  const server = new McpServer({
    name: "wandering-trader",
    version: "0.1.0",
    description: "A single-player wandering-trader roguelike played via MCP tools.",
  });
  registerSessionTools(server, svc);
  registerCityTools(server, svc);
  registerTravelTools(server, svc);
  registerEncounterTools(server, svc);
  registerEndTools(server, svc);
  return server;
}

if (TRANSPORT === "stdio") {
  const server = buildServer(svc);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else if (TRANSPORT === "http") {
  const server = buildServer(svc);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  function isAuthed(req: Request): boolean {
    if (!AUTH_TOKEN) return true;
    return req.headers.get("authorization") === `Bearer ${AUTH_TOKEN}`;
  }

  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") return new Response("ok", { status: 200 });
      if (url.pathname === "/mcp") {
        if (!isAuthed(req)) return new Response("unauthorized", { status: 401 });
        return transport.handleRequest(req);
      }
      return new Response("not found", { status: 404 });
    },
  });
  console.error(`wandering-trader MCP server listening on :${PORT}`);
} else {
  console.error(`Unknown MCP_TRANSPORT: ${TRANSPORT}`);
  process.exit(1);
}
