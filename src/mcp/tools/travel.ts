import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Service } from "../../service";
import { toolResponse } from "../response";

export function registerTravelTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "plan_travel",
    {
      title: "Plan Travel",
      description: "Preview a travel leg to a neighboring city — estimated time, terrain, active events, expected wage cost. Does not advance the clock.",
      inputSchema: { session_id: z.string(), destination_city_id: z.string() },
    },
    async ({ session_id, destination_city_id }) => toolResponse(svc.planTravel(session_id, destination_city_id)),
  );

  server.registerTool(
    "travel",
    {
      title: "Travel to Destination",
      description: "Commit to traveling to a neighboring city. Rolls weather, weight, encounters. Returns 'arrived', 'encounter' (with options to resolve), or 'ended' if day 7 is crossed.",
      inputSchema: { session_id: z.string(), destination_city_id: z.string() },
    },
    async ({ session_id, destination_city_id }) => toolResponse(svc.travel(session_id, destination_city_id)),
  );
}
