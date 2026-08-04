import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { MessageSquareText } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import type { RightPanelSurface } from "~/rightPanelStore";
import { useRightPanelStore } from "~/rightPanelStore";
import {
  resolveSidechatTabs,
  selectParentSidechatTabsState,
  useSidechatStore,
} from "~/sidechatStore";
import { useThreadShells } from "~/state/entities";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import ChatView from "./ChatView";
import { SidechatTabBar } from "./SidechatTabBar";

interface SidechatPanelProps {
  environmentId: EnvironmentId;
  parentThreadRef: ScopedThreadRef;
  surface: Extract<RightPanelSurface, { kind: "sidechat" }>;
  onSpawnSidechat: () => void;
  spawnDisabled: boolean;
}

/**
 * Right-panel surface hosting the parent thread's sidechats: a tab strip on
 * top and the active sidechat's conversation (an embedded ChatView) below.
 */
export function SidechatPanel(props: SidechatPanelProps) {
  const { environmentId, parentThreadRef, surface, onSpawnSidechat, spawnDisabled } = props;
  const threadShells = useThreadShells();
  const tabsState = useSidechatStore(
    useShallow((state) => selectParentSidechatTabsState(state.byParentThreadKey, parentThreadRef)),
  );
  const promotedThreadKeys = useSidechatStore((state) => state.promotedThreadKeys);

  const sidechats = useMemo(
    () =>
      threadShells.filter(
        (thread) =>
          thread.environmentId === parentThreadRef.environmentId &&
          thread.parentThreadId === parentThreadRef.threadId,
      ),
    [parentThreadRef.environmentId, parentThreadRef.threadId, threadShells],
  );
  const { openTabs, closedTabs } = useMemo(
    () => resolveSidechatTabs({ sidechats, tabsState, promotedThreadKeys }),
    [promotedThreadKeys, sidechats, tabsState],
  );

  // Derived at render so stale persisted ids (deleted, promoted, closed-last)
  // fall back without a reconciliation effect.
  const activeSidechatId =
    surface.activeSidechatId !== null && openTabs.some((tab) => tab.id === surface.activeSidechatId)
      ? surface.activeSidechatId
      : (openTabs[0]?.id ?? null);

  const selectSidechat = useCallback(
    (sidechatThreadId: ThreadId | null) => {
      useRightPanelStore.getState().openSidechat(parentThreadRef, sidechatThreadId);
    },
    [parentThreadRef],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SidechatTabBar
        parentThreadRef={parentThreadRef}
        activeSidechatId={activeSidechatId}
        openTabs={openTabs}
        closedTabs={closedTabs}
        onSelectSidechat={selectSidechat}
        onSpawnSidechat={onSpawnSidechat}
        spawnDisabled={spawnDisabled}
      />
      {activeSidechatId !== null ? (
        <ChatView
          key={activeSidechatId}
          environmentId={environmentId}
          threadId={activeSidechatId}
          routeKind="server"
          sidechatParentThreadId={parentThreadRef.threadId}
          surfaceMode="embedded"
          reserveTitleBarControlInset={false}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-xs">
            <div className="mb-5 text-center">
              <h3 className="text-sm font-medium text-foreground">No sidechats yet</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Spawn a side conversation seeded with this thread's context.
              </p>
            </div>
            {spawnDisabled ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="flex min-h-28 w-full cursor-not-allowed flex-col items-start rounded-lg border border-border/80 bg-card p-4 text-left opacity-40 dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5"
                      aria-disabled="true"
                    >
                      <MessageSquareText className="mb-3 size-5" />
                      <span className="text-sm font-medium">New sidechat</span>
                    </button>
                  }
                />
                <TooltipPopup side="top">
                  Sidechats are only available on started server threads.
                </TooltipPopup>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={onSpawnSidechat}
                className="flex min-h-28 w-full flex-col items-start rounded-lg border border-border/80 bg-card p-4 text-left transition hover:border-border hover:bg-accent/60 dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5"
              >
                <MessageSquareText className="mb-3 size-5" />
                <span className="text-sm font-medium">New sidechat</span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Spawn a side conversation.
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
