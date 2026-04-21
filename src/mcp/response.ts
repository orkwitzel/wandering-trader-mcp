export function toolResponse<T>(res: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(res, null, 2) }],
    structuredContent: res as unknown as Record<string, unknown>,
  };
}
