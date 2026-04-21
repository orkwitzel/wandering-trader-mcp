import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Service } from "../../service";
import { toolResponse } from "../response";

export function registerSessionTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "start_game",
    {
      title: "Start Game",
      description: "Begin a new wandering-trader run. Returns session_id and the starting city. Narrate the arrival richly but do not contradict the structured data.",
      inputSchema: { seed: z.number().int().optional() },
    },
    async ({ seed }) => toolResponse(svc.startGame({ seed })),
  );

  server.registerTool(
    "get_state",
    {
      title: "Get Game State",
      description: "Return the full state of the current run.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => toolResponse(svc.getState(session_id)),
  );

  server.registerTool(
    "resume_game",
    {
      title: "Resume Game",
      description: "Resume an existing run. Returns a brief status summary: day, gold, current city, days remaining.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => toolResponse(svc.resumeGame(session_id)),
  );
}
