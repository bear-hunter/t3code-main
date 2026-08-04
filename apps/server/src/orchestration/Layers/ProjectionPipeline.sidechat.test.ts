import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { ServerConfig } from "../../config.ts";

const TestLayer = OrchestrationProjectionSnapshotQueryLive.pipe(
  Layer.provideMerge(OrchestrationProjectionPipelineLive),
  Layer.provideMerge(OrchestrationEventStoreLive),
  Layer.provideMerge(RepositoryIdentityResolver.layer),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-sidechat-proj-test-" })),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(TestLayer)("ProjectionPipeline sidechat linkage", (it) => {
  it.effect("persists parent linkage and serves it through the shell query", () =>
    Effect.gen(function* () {
      const projectionPipeline = yield* OrchestrationProjectionPipeline;
      const snapshotQuery = yield* ProjectionSnapshotQuery;
      const eventStore = yield* OrchestrationEventStore;
      const sql = yield* SqlClient.SqlClient;
      const now = "2026-01-01T00:00:00.000Z";
      const modelSelection = {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      };

      yield* eventStore.append({
        type: "project.created",
        eventId: EventId.make("evt-1"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-1"),
        occurredAt: now,
        commandId: CommandId.make("cmd-1"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-1"),
        metadata: {},
        payload: {
          projectId: ProjectId.make("project-1"),
          title: "Project 1",
          workspaceRoot: "/tmp/project-1",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      });

      yield* eventStore.append({
        type: "thread.created",
        eventId: EventId.make("evt-2"),
        aggregateKind: "thread",
        aggregateId: ThreadId.make("thread-main"),
        occurredAt: now,
        commandId: CommandId.make("cmd-2"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-2"),
        metadata: {},
        payload: {
          threadId: ThreadId.make("thread-main"),
          projectId: ProjectId.make("project-1"),
          title: "Main Thread",
          modelSelection,
          runtimeMode: "full-access",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      yield* eventStore.append({
        type: "thread.created",
        eventId: EventId.make("evt-3"),
        aggregateKind: "thread",
        aggregateId: ThreadId.make("thread-sidechat"),
        occurredAt: now,
        commandId: CommandId.make("cmd-3"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-3"),
        metadata: {},
        payload: {
          threadId: ThreadId.make("thread-sidechat"),
          projectId: ProjectId.make("project-1"),
          title: "Sidechat",
          parentThreadId: ThreadId.make("thread-main"),
          spawnedAtMessageId: MessageId.make("message-spawn"),
          modelSelection,
          runtimeMode: "full-access",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      yield* projectionPipeline.bootstrap;

      const threadRows = yield* sql<{
        readonly threadId: string;
        readonly parentThreadId: string | null;
        readonly spawnedAtMessageId: string | null;
      }>`
        SELECT
          thread_id AS "threadId",
          parent_thread_id AS "parentThreadId",
          spawned_at_message_id AS "spawnedAtMessageId"
        FROM projection_threads
        ORDER BY thread_id ASC
      `;
      assert.deepEqual(threadRows, [
        { threadId: "thread-main", parentThreadId: null, spawnedAtMessageId: null },
        {
          threadId: "thread-sidechat",
          parentThreadId: "thread-main",
          spawnedAtMessageId: "message-spawn",
        },
      ]);

      const sidechatShell = yield* snapshotQuery.getThreadShellById(
        ThreadId.make("thread-sidechat"),
      );
      assert.isTrue(Option.isSome(sidechatShell));
      if (Option.isSome(sidechatShell)) {
        assert.equal(sidechatShell.value.parentThreadId, "thread-main");
        assert.equal(sidechatShell.value.spawnedAtMessageId, "message-spawn");
      }

      const shellSnapshot = yield* snapshotQuery.getShellSnapshot();
      const snapshotSidechat = shellSnapshot.threads.find(
        (thread) => thread.id === "thread-sidechat",
      );
      assert.equal(snapshotSidechat?.parentThreadId, "thread-main");
      const snapshotMain = shellSnapshot.threads.find((thread) => thread.id === "thread-main");
      assert.equal(snapshotMain?.parentThreadId, null);
    }),
  );
});
