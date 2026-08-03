import type { OrchestrationMessage } from "@t3tools/contracts";

/**
 * Character budget for the parent transcript seeded into a sidechat's first
 * turn. Matches the buffered-delivery scale the server already handles per
 * message; the most recent messages win when the transcript is larger.
 */
export const SIDECHAT_SEED_TRANSCRIPT_MAX_CHARS = 30_000;

export const SIDECHAT_DEFAULT_TITLE = "Sidechat";

interface SidechatSeedMessage {
  readonly id: string;
  readonly role: OrchestrationMessage["role"];
  readonly text: string;
  readonly streaming: boolean;
}

function roleLabel(role: SidechatSeedMessage["role"]): string {
  switch (role) {
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
  }
}

/**
 * Renders the parent thread's transcript into the seed text prefixed to a
 * sidechat's first message. Messages after `spawnedAtMessageId` (when given)
 * are cut so the sidechat sees the conversation as of its spawn point, and
 * the most recent messages are kept when the transcript exceeds `maxChars`.
 * Returns null when there is nothing worth seeding.
 */
export function buildSidechatSeedPrompt(input: {
  readonly parentTitle: string;
  readonly messages: ReadonlyArray<SidechatSeedMessage>;
  readonly spawnedAtMessageId?: string | null;
  readonly maxChars?: number;
}): string | null {
  const maxChars = input.maxChars ?? SIDECHAT_SEED_TRANSCRIPT_MAX_CHARS;
  const cutIndex =
    input.spawnedAtMessageId != null
      ? input.messages.findIndex((message) => message.id === input.spawnedAtMessageId)
      : -1;
  const scopedMessages = cutIndex >= 0 ? input.messages.slice(0, cutIndex + 1) : input.messages;
  const rendered = scopedMessages.flatMap((message) => {
    const text = message.text.trim();
    if (message.streaming || text.length === 0) return [];
    return [`${roleLabel(message.role)}:\n${text}`];
  });
  if (rendered.length === 0) return null;

  const kept: string[] = [];
  let keptChars = 0;
  for (let index = rendered.length - 1; index >= 0; index -= 1) {
    const entry = rendered[index]!;
    if (kept.length > 0 && keptChars + entry.length > maxChars) break;
    kept.unshift(entry);
    keptChars += entry.length;
  }
  const truncated = kept.length < rendered.length;

  return [
    `This is a sidechat spawned from the thread "${input.parentTitle}". The main conversation so far is included below as shared context; it is background only — respond to the message after the transcript.`,
    "--- Begin main thread transcript ---",
    ...(truncated ? ["[Earlier messages omitted to fit the context budget.]"] : []),
    kept.join("\n\n"),
    "--- End main thread transcript ---",
  ].join("\n\n");
}

/** First-turn text for a sidechat: seed transcript, then the user's message. */
export function applySidechatSeedPrompt(seed: string, userText: string): string {
  return `${seed}\n\n${userText}`;
}
