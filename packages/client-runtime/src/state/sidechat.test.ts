import { describe, expect, it } from "vite-plus/test";

import { applySidechatSeedPrompt, buildSidechatSeedPrompt } from "./sidechat.ts";

const message = (
  id: string,
  role: "user" | "assistant" | "system",
  text: string,
  streaming = false,
) => ({ id, role, text, streaming });

describe("buildSidechatSeedPrompt", () => {
  it("renders the parent transcript with role labels", () => {
    const seed = buildSidechatSeedPrompt({
      parentTitle: "Fix auth",
      messages: [
        message("m1", "user", "Why does login fail?"),
        message("m2", "assistant", "The token refresh races the logout."),
      ],
    });
    expect(seed).toContain('spawned from the thread "Fix auth"');
    expect(seed).toContain("User:\nWhy does login fail?");
    expect(seed).toContain("Assistant:\nThe token refresh races the logout.");
    expect(seed).not.toContain("omitted");
  });

  it("skips streaming and empty messages and returns null when nothing remains", () => {
    expect(
      buildSidechatSeedPrompt({
        parentTitle: "Empty",
        messages: [message("m1", "assistant", "partial", true), message("m2", "user", "   ")],
      }),
    ).toBeNull();
  });

  it("cuts the transcript at spawnedAtMessageId", () => {
    const seed = buildSidechatSeedPrompt({
      parentTitle: "Cut",
      messages: [
        message("m1", "user", "first"),
        message("m2", "assistant", "second"),
        message("m3", "user", "third"),
      ],
      spawnedAtMessageId: "m2",
    });
    expect(seed).toContain("first");
    expect(seed).toContain("second");
    expect(seed).not.toContain("third");
  });

  it("keeps the most recent messages within the budget and notes truncation", () => {
    const seed = buildSidechatSeedPrompt({
      parentTitle: "Long",
      messages: [
        message("m1", "user", "a".repeat(80)),
        message("m2", "assistant", "b".repeat(80)),
        message("m3", "user", "c".repeat(80)),
      ],
      maxChars: 200,
    });
    expect(seed).toContain("[Earlier messages omitted to fit the context budget.]");
    expect(seed).not.toContain("a".repeat(80));
    expect(seed).toContain("b".repeat(80));
    expect(seed).toContain("c".repeat(80));
  });

  it("keeps a single oversized message rather than seeding nothing", () => {
    const seed = buildSidechatSeedPrompt({
      parentTitle: "Oversized",
      messages: [message("m1", "user", "x".repeat(500))],
      maxChars: 100,
    });
    expect(seed).toContain("x".repeat(500));
  });
});

describe("applySidechatSeedPrompt", () => {
  it("prefixes the seed to the user's first message", () => {
    expect(applySidechatSeedPrompt("SEED", "question")).toBe("SEED\n\nquestion");
  });
});
