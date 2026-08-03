/**
 * Client-side sidechat tab state. The list of live sidechats is server data
 * (shell threads with a `parentThreadId`); this store only remembers what the
 * server does not: per-parent tab order, tabs closed without deleting the
 * thread, first-turn seed prompts pending until the first send, and sidechats
 * the user promoted back into the sidebar thread list.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

const SIDECHAT_STORAGE_KEY = "t3code:sidechat-state:v1";
const SIDECHAT_STORAGE_VERSION = 1;

export interface ParentSidechatTabsState {
  tabOrder: ThreadId[];
  closedTabIds: ThreadId[];
}

interface SidechatStoreState {
  byParentThreadKey: Record<string, ParentSidechatTabsState>;
  pendingSeedByThreadKey: Record<string, string>;
  promotedThreadKeys: string[];
  registerSpawnedSidechat: (
    parentRef: ScopedThreadRef,
    sidechatThreadId: ThreadId,
    seed: string | null,
  ) => void;
  closeSidechatTab: (parentRef: ScopedThreadRef, sidechatThreadId: ThreadId) => void;
  reopenSidechatTab: (parentRef: ScopedThreadRef, sidechatThreadId: ThreadId) => void;
  promoteSidechat: (parentRef: ScopedThreadRef, sidechatRef: ScopedThreadRef) => void;
  clearPendingSeed: (sidechatRef: ScopedThreadRef) => void;
  /** Delete cleanup: drops the thread as a parent and as anyone's sidechat. */
  removeThread: (ref: ScopedThreadRef) => void;
}

const EMPTY_TABS_STATE: ParentSidechatTabsState = { tabOrder: [], closedTabIds: [] };

const updateParent = (
  byParentThreadKey: Record<string, ParentSidechatTabsState>,
  parentKey: string,
  updater: (current: ParentSidechatTabsState) => ParentSidechatTabsState,
): Record<string, ParentSidechatTabsState> => {
  const current = byParentThreadKey[parentKey] ?? EMPTY_TABS_STATE;
  const next = updater(current);
  if (next.tabOrder.length === 0 && next.closedTabIds.length === 0) {
    if (!(parentKey in byParentThreadKey)) return byParentThreadKey;
    const { [parentKey]: _removed, ...rest } = byParentThreadKey;
    return rest;
  }
  if (next === current) return byParentThreadKey;
  return { ...byParentThreadKey, [parentKey]: next };
};

export const useSidechatStore = create<SidechatStoreState>()(
  persist(
    (set) => ({
      byParentThreadKey: {},
      pendingSeedByThreadKey: {},
      promotedThreadKeys: [],
      registerSpawnedSidechat: (parentRef, sidechatThreadId, seed) =>
        set((state) => ({
          byParentThreadKey: updateParent(
            state.byParentThreadKey,
            scopedThreadKey(parentRef),
            (current) => ({
              tabOrder: current.tabOrder.includes(sidechatThreadId)
                ? current.tabOrder
                : [...current.tabOrder, sidechatThreadId],
              closedTabIds: current.closedTabIds.filter((id) => id !== sidechatThreadId),
            }),
          ),
          pendingSeedByThreadKey:
            seed === null
              ? state.pendingSeedByThreadKey
              : {
                  ...state.pendingSeedByThreadKey,
                  [scopedThreadKey({
                    environmentId: parentRef.environmentId,
                    threadId: sidechatThreadId,
                  })]: seed,
                },
        })),
      closeSidechatTab: (parentRef, sidechatThreadId) =>
        set((state) => ({
          byParentThreadKey: updateParent(
            state.byParentThreadKey,
            scopedThreadKey(parentRef),
            (current) =>
              current.closedTabIds.includes(sidechatThreadId)
                ? current
                : {
                    tabOrder: current.tabOrder.includes(sidechatThreadId)
                      ? current.tabOrder
                      : [...current.tabOrder, sidechatThreadId],
                    closedTabIds: [...current.closedTabIds, sidechatThreadId],
                  },
          ),
        })),
      reopenSidechatTab: (parentRef, sidechatThreadId) =>
        set((state) => ({
          byParentThreadKey: updateParent(
            state.byParentThreadKey,
            scopedThreadKey(parentRef),
            (current) =>
              current.closedTabIds.includes(sidechatThreadId)
                ? {
                    ...current,
                    closedTabIds: current.closedTabIds.filter((id) => id !== sidechatThreadId),
                  }
                : current,
          ),
        })),
      promoteSidechat: (parentRef, sidechatRef) =>
        set((state) => {
          const sidechatKey = scopedThreadKey(sidechatRef);
          return {
            byParentThreadKey: updateParent(
              state.byParentThreadKey,
              scopedThreadKey(parentRef),
              (current) => ({
                tabOrder: current.tabOrder.filter((id) => id !== sidechatRef.threadId),
                closedTabIds: current.closedTabIds.filter((id) => id !== sidechatRef.threadId),
              }),
            ),
            promotedThreadKeys: state.promotedThreadKeys.includes(sidechatKey)
              ? state.promotedThreadKeys
              : [...state.promotedThreadKeys, sidechatKey],
          };
        }),
      clearPendingSeed: (sidechatRef) =>
        set((state) => {
          const sidechatKey = scopedThreadKey(sidechatRef);
          if (!(sidechatKey in state.pendingSeedByThreadKey)) return state;
          const { [sidechatKey]: _removed, ...rest } = state.pendingSeedByThreadKey;
          return { pendingSeedByThreadKey: rest };
        }),
      removeThread: (ref) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          const { [threadKey]: _removedParent, ...remainingParents } = state.byParentThreadKey;
          const byParentThreadKey = Object.fromEntries(
            Object.entries(remainingParents).flatMap(([parentKey, tabsState]) => {
              const tabOrder = tabsState.tabOrder.filter((id) => id !== ref.threadId);
              const closedTabIds = tabsState.closedTabIds.filter((id) => id !== ref.threadId);
              if (tabOrder.length === 0 && closedTabIds.length === 0) return [];
              return [[parentKey, { tabOrder, closedTabIds }] as const];
            }),
          );
          const { [threadKey]: _removedSeed, ...pendingSeedByThreadKey } =
            state.pendingSeedByThreadKey;
          return {
            byParentThreadKey,
            pendingSeedByThreadKey,
            promotedThreadKeys: state.promotedThreadKeys.filter((key) => key !== threadKey),
          };
        }),
    }),
    {
      name: SIDECHAT_STORAGE_KEY,
      version: SIDECHAT_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        byParentThreadKey: state.byParentThreadKey,
        pendingSeedByThreadKey: state.pendingSeedByThreadKey,
        promotedThreadKeys: state.promotedThreadKeys,
      }),
    },
  ),
);

export function selectParentSidechatTabsState(
  byParentThreadKey: Record<string, ParentSidechatTabsState>,
  parentRef: ScopedThreadRef | null | undefined,
): ParentSidechatTabsState {
  if (!parentRef) return EMPTY_TABS_STATE;
  return byParentThreadKey[scopedThreadKey(parentRef)] ?? EMPTY_TABS_STATE;
}

/**
 * Splits a parent's live sidechat shells into the open tab list (remembered
 * order first, unknown spawns appended in creation order) and the
 * closed-but-not-deleted list surfaced by the reopen menu. Promoted sidechats
 * belong to the sidebar again and appear in neither.
 */
export function resolveSidechatTabs<
  T extends { id: ThreadId; environmentId: EnvironmentId; createdAt: string },
>(input: {
  sidechats: ReadonlyArray<T>;
  tabsState: ParentSidechatTabsState;
  promotedThreadKeys: ReadonlyArray<string>;
}): { openTabs: T[]; closedTabs: T[] } {
  const promoted = new Set(input.promotedThreadKeys);
  const closed = new Set(input.tabsState.closedTabIds);
  const orderIndex = new Map(input.tabsState.tabOrder.map((id, index) => [id, index] as const));
  const visible = input.sidechats
    .filter(
      (thread) =>
        !promoted.has(
          scopedThreadKey({ environmentId: thread.environmentId, threadId: thread.id }),
        ),
    )
    .toSorted((left, right) => {
      const leftIndex = orderIndex.get(left.id);
      const rightIndex = orderIndex.get(right.id);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    });
  return {
    openTabs: visible.filter((thread) => !closed.has(thread.id)),
    closedTabs: visible.filter((thread) => closed.has(thread.id)),
  };
}

/**
 * Sidechats live in their parent's tab strip, not the sidebar or palette
 * lists; a promoted sidechat rejoins the normal lists.
 */
export function isSidechatHiddenFromThreadLists(
  thread: {
    id: ThreadId;
    environmentId: EnvironmentId;
    parentThreadId?: ThreadId | null | undefined;
  },
  promotedThreadKeys: ReadonlyArray<string>,
): boolean {
  if (thread.parentThreadId == null) return false;
  return !promotedThreadKeys.includes(
    scopedThreadKey({ environmentId: thread.environmentId, threadId: thread.id }),
  );
}
