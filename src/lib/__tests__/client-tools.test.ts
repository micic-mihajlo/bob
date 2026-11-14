import { describe, expect, it } from "vitest";
import { attachClientTools, callClientTool, clientToolSpecs, isClientTool, settleClientTool } from "../client-tools";

describe("client tools", () => {
  it("offers the desktop's tools while attached and routes a call through the stream and back", async () => {
    const chunks: { id: string; toolName: string; input: unknown }[] = [];
    const detach = attachClientTools("captain", [{ name: "composio__LIST", description: "List", parameters: { properties: { repo: { type: "string" } } } }], (c) => chunks.push(c));
    expect(clientToolSpecs("captain")).toMatchObject([{ name: "composio__LIST", jsonSchema: { type: "object", properties: { repo: { type: "string" } } } }]);
    expect(isClientTool("captain", "composio__LIST")).toBe(true);

    const call = callClientTool("captain", "composio__LIST", { repo: "bob" });
    expect(chunks).toMatchObject([{ toolName: "composio__LIST", input: { repo: "bob" } }]);
    expect(settleClientTool(chunks[0].id, { output: { prs: [243] } })).toBe(true);
    await expect(call).resolves.toEqual({ output: { prs: [243] } });
    expect(settleClientTool(chunks[0].id, { output: null })).toBe(false);

    detach();
    expect(clientToolSpecs("captain")).toEqual([]);
    await expect(callClientTool("captain", "composio__LIST", {})).resolves.toHaveProperty("errorText");
  });
});
