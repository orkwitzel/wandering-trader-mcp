import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerEncounterTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "resolve_encounter",
    {
      title: "Resolve Encounter",
      description: "Commit to one of the visible encounter options. Server rolls success based on the quoted percentage; applies outcome; continues the leg.",
      inputSchema: { session_id: z.string(), choice: z.string() },
    },
    async ({ session_id, choice }) => {
      const res = svc.resolveEncounter(session_id, choice);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as unknown as Record<string, unknown> };
    },
  );
}
