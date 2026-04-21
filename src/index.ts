import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Database } from "bun:sqlite";
import { initSchema } from "./db/schema";
import { createService } from "./service";
import { registerSessionTools } from "./mcp/tools/session";
import { registerCityTools } from "./mcp/tools/city";
import { registerTravelTools } from "./mcp/tools/travel";
import { registerEncounterTools } from "./mcp/tools/encounter";
import { registerEndTools } from "./mcp/tools/end";

const DB_PATH = process.env.WANDERING_TRADER_DB ?? "wandering-trader.db";

const db = new Database(DB_PATH, { create: true });
initSchema(db);
const svc = createService(db);

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

const transport = new StdioServerTransport();
await server.connect(transport);
