import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Service } from "../../service";
import { toolResponse } from "../response";

export function registerEndTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "end_game",
    {
      title: "End Run",
      description: "Force-tally the current run and mark it completed. Normally fired automatically when day 7 is crossed.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => toolResponse(svc.endGame(session_id)),
  );
}
