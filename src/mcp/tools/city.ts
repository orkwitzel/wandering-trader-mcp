import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Service } from "../../service";
import { toolResponse } from "../response";

export function registerCityTools(server: McpServer, svc: Service): void {
  server.registerTool(
    "look",
    {
      title: "Look Around",
      description: "Examine the current city: market prices, rare items, hires, and any rumors you know. Narrate the scene richly but do not invent stock or prices not in the structured data.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => toolResponse(svc.look(session_id)),
  );

  server.registerTool(
    "buy",
    {
      title: "Buy Goods",
      description: "Purchase commodities (by name) or a unique item (by id) from the current city.",
      inputSchema: {
        session_id: z.string(),
        item: z.string(),
        quantity: z.number().int().positive(),
      },
    },
    async ({ session_id, item, quantity }) => toolResponse(svc.buy(session_id, { item, quantity })),
  );

  server.registerTool(
    "sell",
    {
      title: "Sell Goods",
      description: "Sell commodities (by name) or a unique item you own (by id) to the current city.",
      inputSchema: {
        session_id: z.string(),
        item: z.string(),
        quantity: z.number().int().positive(),
      },
    },
    async ({ session_id, item, quantity }) => toolResponse(svc.sell(session_id, { item, quantity })),
  );

  server.registerTool(
    "hire",
    {
      title: "Hire Crew",
      description: "Hire a crew member from the current city. Pays the hire fee immediately; daily wages deduct per travel tick.",
      inputSchema: { session_id: z.string(), hire_id: z.string() },
    },
    async ({ session_id, hire_id }) => toolResponse(svc.hire(session_id, hire_id)),
  );

  server.registerTool(
    "dismiss",
    {
      title: "Dismiss Crew",
      description: "Release a crew member. No refund of hire fee.",
      inputSchema: { session_id: z.string(), crew_id: z.string() },
    },
    async ({ session_id, crew_id }) => toolResponse(svc.dismiss(session_id, crew_id)),
  );

  server.registerTool(
    "listen",
    {
      title: "Listen for Rumors",
      description: "Spend about a tenth of a day in the local taverns listening for gossip about other cities and roads.",
      inputSchema: { session_id: z.string() },
    },
    async ({ session_id }) => toolResponse(svc.listen(session_id)),
  );
}
