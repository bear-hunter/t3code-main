import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asCommandId = (value: string): CommandId => CommandId.make(value);
const asEventId = (value: string): EventId => EventId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asMessageId = (value: string): MessageId => MessageId.make(value);

const now = "2026-01-01T00:00:00.000Z";

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
};

const projectCreatedEvent = (sequence: number, projectId: string): OrchestrationEvent => ({
  sequence,
  eventId: asEventId(`evt-project-${projectId}`),
  aggregateKind: "project",
  aggregateId: asProjectId(projectId),
  type: "project.created",
  occurredAt: now,
  commandId: asCommandId(`cmd-project-${projectId}`),
  causationEventId: null,
  correlationId: asCommandId(`cmd-project-${projectId}`),
  metadata: {},
  payload: {
    projectId: asProjectId(projectId),
    title: `Project ${projectId}`,
    workspaceRoot: `/tmp/${projectId}`,
    defaultModelSelection: null,
    scripts: [],
    createdAt: now,
    updatedAt: now,
  },
});

const threadCreatedEvent = (
  sequence: number,
  threadId: string,
  projectId: string,
  parentThreadId?: string,
): OrchestrationEvent => ({
  sequence,
  eventId: asEventId(`evt-thread-${threadId}`),
  aggregateKind: "thread",
  aggregateId: asThreadId(threadId),
  type: "thread.created",
  occurredAt: now,
  commandId: asCommandId(`cmd-thread-${threadId}`),
  causationEventId: null,
  correlationId: asCommandId(`cmd-thread-${threadId}`),
  metadata: {},
  payload: {
    threadId: asThreadId(threadId),
    projectId: asProjectId(projectId),
    title: `Thread ${threadId}`,
    ...(parentThreadId !== undefined ? { parentThreadId: asThreadId(parentThreadId) } : {}),
    modelSelection,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    runtimeMode: "full-access",
    branch: null,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
  },
});

// project-a holds a parent thread and one existing sidechat; project-b is
// there to exercise the cross-project rejection.
const seedReadModel = Effect.gen(function* () {
  let readModel: OrchestrationReadModel = createEmptyReadModel(now);
  readModel = yield* projectEvent(readModel, projectCreatedEvent(1, "project-a"));
  readModel = yield* projectEvent(readModel, projectCreatedEvent(2, "project-b"));
  readModel = yield* projectEvent(readModel, threadCreatedEvent(3, "thread-main", "project-a"));
  readModel = yield* projectEvent(
    readModel,
    threadCreatedEvent(4, "thread-sidechat", "project-a", "thread-main"),
  );
  return readModel;
});

const sidechatCreateCommand = (
  overrides: Partial<Extract<OrchestrationCommand, { type: "thread.create" }>>,
): Extract<OrchestrationCommand, { type: "thread.create" }> => ({
  type: "thread.create",
  commandId: asCommandId("cmd-create-sidechat"),
  threadId: asThreadId("thread-sidechat-next"),
  projectId: asProjectId("project-a"),
  title: "Sidechat",
  parentThreadId: asThreadId("thread-main"),
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  branch: null,
  worktreePath: null,
  createdAt: now,
  ...overrides,
});

it.layer(NodeServices.layer)("decider sidechat flows", (it) => {
  it.effect("creates a sidechat carrying parent linkage into event and read model", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const decided = yield* decideOrchestrationCommand({
        command: sidechatCreateCommand({
          spawnedAtMessageId: asMessageId("message-spawn"),
        }),
        readModel,
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events).toHaveLength(1);
      const event = events[0];
      if (event?.type !== "thread.created") {
        throw new Error(`expected thread.created, got ${event?.type}`);
      }
      expect(event.payload.parentThreadId).toBe("thread-main");
      expect(event.payload.spawnedAtMessageId).toBe("message-spawn");

      const nextReadModel = yield* projectEvent(readModel, { ...event, sequence: 5 });
      const sidechat = nextReadModel.threads.find((thread) => thread.id === "thread-sidechat-next");
      expect(sidechat?.parentThreadId).toBe("thread-main");
      expect(sidechat?.spawnedAtMessageId).toBe("message-spawn");
    }),
  );

  it.effect("rejects a sidechat whose parent does not exist", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: sidechatCreateCommand({ parentThreadId: asThreadId("thread-missing") }),
          readModel,
        }),
      );
      expect(error.message).toContain("does not exist");
    }),
  );

  it.effect("rejects a sidechat whose parent is in a different project", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: sidechatCreateCommand({ projectId: asProjectId("project-b") }),
          readModel,
        }),
      );
      expect(error.message).toContain("different project");
    }),
  );

  it.effect("rejects a sidechat of a sidechat", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: sidechatCreateCommand({ parentThreadId: asThreadId("thread-sidechat") }),
          readModel,
        }),
      );
      expect(error.message).toContain("cannot have sidechats");
    }),
  );

  it.effect("rejects a sidechat whose parent is deleted", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const deletedParentReadModel = yield* projectEvent(readModel, {
        sequence: 5,
        eventId: asEventId("evt-delete-main"),
        aggregateKind: "thread",
        aggregateId: asThreadId("thread-main"),
        type: "thread.deleted",
        occurredAt: now,
        commandId: asCommandId("cmd-delete-main"),
        causationEventId: null,
        correlationId: asCommandId("cmd-delete-main"),
        metadata: {},
        payload: {
          threadId: asThreadId("thread-main"),
          deletedAt: now,
        },
      });
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: sidechatCreateCommand({}),
          readModel: deletedParentReadModel,
        }),
      );
      expect(error.message).toContain("deleted");
    }),
  );

  it.effect("deleting a parent cascades to its live sidechats", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const decided = yield* decideOrchestrationCommand({
        command: {
          type: "thread.delete",
          commandId: asCommandId("cmd-delete-parent"),
          threadId: asThreadId("thread-main"),
        },
        readModel,
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => [event.type, event.aggregateId] as const)).toEqual([
        ["thread.deleted", "thread-sidechat"],
        ["thread.deleted", "thread-main"],
      ]);
    }),
  );

  it.effect("deleting a parent skips already-deleted sidechats", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const withDeletedSidechat = yield* projectEvent(readModel, {
        sequence: 5,
        eventId: asEventId("evt-delete-sidechat"),
        aggregateKind: "thread",
        aggregateId: asThreadId("thread-sidechat"),
        type: "thread.deleted",
        occurredAt: now,
        commandId: asCommandId("cmd-delete-sidechat"),
        causationEventId: null,
        correlationId: asCommandId("cmd-delete-sidechat"),
        metadata: {},
        payload: {
          threadId: asThreadId("thread-sidechat"),
          deletedAt: now,
        },
      });
      const decided = yield* decideOrchestrationCommand({
        command: {
          type: "thread.delete",
          commandId: asCommandId("cmd-delete-parent"),
          threadId: asThreadId("thread-main"),
        },
        readModel: withDeletedSidechat,
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => [event.type, event.aggregateId] as const)).toEqual([
        ["thread.deleted", "thread-main"],
      ]);
    }),
  );

  it.effect("deleting a sidechat leaves its parent alone", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const decided = yield* decideOrchestrationCommand({
        command: {
          type: "thread.delete",
          commandId: asCommandId("cmd-delete-sidechat"),
          threadId: asThreadId("thread-sidechat"),
        },
        readModel,
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => [event.type, event.aggregateId] as const)).toEqual([
        ["thread.deleted", "thread-sidechat"],
      ]);
    }),
  );
});
