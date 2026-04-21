import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Service } from "../../service";
import { toolResponse } from "../response";

export function registerEncounterTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "resolve_encounter",
    {
      title: "Resolve Encounter",
      description: "Commit to one of the visible encounter options. Server rolls success based on the quoted percentage; applies outcome; continues the leg.",
      inputSchema: {
        session_id: z.string(),
        choice: z.enum(["fight", "flee", "bribe", "parley", "endure", "help", "accept", "ignore"]),
      },
    },
    async ({ session_id, choice }) => toolResponse(svc.resolveEncounter(session_id, choice)),
  );
}
