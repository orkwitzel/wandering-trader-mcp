import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import type { Service } from "../../service";

export function registerTravelTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "plan_travel",
    {
      title: "Plan Travel",
      description: "Preview a travel leg to a neighboring city — estimated time, terrain, active events, expected wage cost. Does not advance the clock.",
      inputSchema: { session_id: z.string(), destination_city_id: z.string() },
    },
    async ({ session_id, destination_city_id }) => {
      const res = svc.planTravel(session_id, destination_city_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as unknown as Record<string, unknown> };
    },
  );

  server.registerTool(
    "travel",
    {
      title: "Travel to Destination",
      description: "Commit to traveling to a neighboring city. Rolls weather, weight, encounters. Returns 'arrived', 'encounter' (with options to resolve), or 'ended' if day 7 is crossed.",
      inputSchema: { session_id: z.string(), destination_city_id: z.string() },
    },
    async ({ session_id, destination_city_id }) => {
      const res = svc.travel(session_id, destination_city_id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }], structuredContent: res as unknown as Record<string, unknown> };
    },
  );
}
