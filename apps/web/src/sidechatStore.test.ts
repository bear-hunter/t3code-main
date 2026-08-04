import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import { isSidechatHiddenFromThreadLists, resolveSidechatTabs } from "./sidechatStore";

const environmentId = EnvironmentId.make("env-1");
const sidechat = (id: string, createdAt: string) => ({
  id: ThreadId.make(id),
  environmentId,
  createdAt,
});
const keyOf = (id: string) => scopedThreadKey({ environmentId, threadId: ThreadId.make(id) });

describe("resolveSidechatTabs", () => {
  it("orders remembered tabs first and appends unknown spawns by creation time", () => {
    const { openTabs, closedTabs } = resolveSidechatTabs({
      sidechats: [
        sidechat("s-new", "2026-01-03T00:00:00.000Z"),
        sidechat("s-b", "2026-01-02T00:00:00.000Z"),
        sidechat("s-a", "2026-01-01T00:00:00.000Z"),
      ],
      tabsState: { tabOrder: [ThreadId.make("s-b"), ThreadId.make("s-a")], closedTabIds: [] },
      promotedThreadKeys: [],
    });
    expect(openTabs.map((tab) => tab.id)).toEqual(["s-b", "s-a", "s-new"]);
    expect(closedTabs).toEqual([]);
  });

  it("splits closed tabs out of the open strip", () => {
    const { openTabs, closedTabs } = resolveSidechatTabs({
      sidechats: [
        sidechat("s-a", "2026-01-01T00:00:00.000Z"),
        sidechat("s-b", "2026-01-02T00:00:00.000Z"),
      ],
      tabsState: {
        tabOrder: [ThreadId.make("s-a"), ThreadId.make("s-b")],
        closedTabIds: [ThreadId.make("s-a")],
      },
      promotedThreadKeys: [],
    });
    expect(openTabs.map((tab) => tab.id)).toEqual(["s-b"]);
    expect(closedTabs.map((tab) => tab.id)).toEqual(["s-a"]);
  });

  it("keeps promoted sidechats out of both lists", () => {
    const { openTabs, closedTabs } = resolveSidechatTabs({
      sidechats: [sidechat("s-a", "2026-01-01T00:00:00.000Z")],
      tabsState: { tabOrder: [ThreadId.make("s-a")], closedTabIds: [] },
      promotedThreadKeys: [keyOf("s-a")],
    });
    expect(openTabs).toEqual([]);
    expect(closedTabs).toEqual([]);
  });
});

describe("isSidechatHiddenFromThreadLists", () => {
  const parentThreadId = ThreadId.make("parent-1");

  it("hides sidechats and keeps plain threads visible", () => {
    expect(
      isSidechatHiddenFromThreadLists(
        { id: ThreadId.make("s-a"), environmentId, parentThreadId },
        [],
      ),
    ).toBe(true);
    expect(
      isSidechatHiddenFromThreadLists(
        { id: ThreadId.make("t-a"), environmentId, parentThreadId: null },
        [],
      ),
    ).toBe(false);
    expect(isSidechatHiddenFromThreadLists({ id: ThreadId.make("t-b"), environmentId }, [])).toBe(
      false,
    );
  });

  it("shows promoted sidechats again", () => {
    expect(
      isSidechatHiddenFromThreadLists({ id: ThreadId.make("s-a"), environmentId, parentThreadId }, [
        keyOf("s-a"),
      ]),
    ).toBe(false);
  });
});
