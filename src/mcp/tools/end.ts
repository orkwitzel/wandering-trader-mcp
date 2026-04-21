import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerEndTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "end_game",
    {
      title: "End Run",
      description: "Force-tally the current run and mark it completed. Normally fired automatically when day 7 is crossed.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => {
      const res = svc.endGame(session_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as unknown as Record<string, unknown> };
    },
  );
}
