import type { ContextMenuItem, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { History, MessageSquareText, Plus, X } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { useThreadActions } from "~/hooks/useThreadActions";
import { useSidechatStore } from "~/sidechatStore";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export interface SidechatTab {
  id: ThreadId;
  title: string;
}

interface SidechatTabBarProps {
  parentThreadRef: ScopedThreadRef;
  /** Sidechat currently displayed in the panel, or null when none is. */
  activeSidechatId: ThreadId | null;
  openTabs: ReadonlyArray<SidechatTab>;
  closedTabs: ReadonlyArray<SidechatTab>;
  onSelectSidechat: (sidechatThreadId: ThreadId | null) => void;
  onSpawnSidechat: () => void;
  spawnDisabled: boolean;
}

type SidechatTabContextMenuAction =
  | "close"
  | "close-others"
  | "close-to-right"
  | "promote"
  | "delete";

/**
 * Tab strip at the top of the right panel's sidechat surface: one tab per
 * live sidechat. Renders nothing while the thread has no sidechats, so the
 * surface's empty state can take over.
 */
export function SidechatTabBar(props: SidechatTabBarProps) {
  const { parentThreadRef, activeSidechatId, openTabs, closedTabs, onSelectSidechat } = props;
  const tabListRef = useRef<HTMLDivElement>(null);
  const closeSidechatTab = useSidechatStore((state) => state.closeSidechatTab);
  const reopenSidechatTab = useSidechatStore((state) => state.reopenSidechatTab);
  const promoteSidechat = useSidechatStore((state) => state.promoteSidechat);
  const { confirmAndDeleteThread } = useThreadActions();

  const selectFallbackAfterHide = useCallback(
    (hiddenId: ThreadId) => {
      if (activeSidechatId !== hiddenId) return;
      const remaining = openTabs.filter((tab) => tab.id !== hiddenId);
      const hiddenIndex = openTabs.findIndex((tab) => tab.id === hiddenId);
      const fallback = remaining[Math.min(Math.max(hiddenIndex - 1, 0), remaining.length - 1)];
      onSelectSidechat(fallback?.id ?? null);
    },
    [activeSidechatId, onSelectSidechat, openTabs],
  );

  const closeTab = useCallback(
    (sidechatThreadId: ThreadId) => {
      closeSidechatTab(parentThreadRef, sidechatThreadId);
      selectFallbackAfterHide(sidechatThreadId);
    },
    [closeSidechatTab, parentThreadRef, selectFallbackAfterHide],
  );

  const reopenTab = useCallback(
    (sidechatThreadId: ThreadId) => {
      reopenSidechatTab(parentThreadRef, sidechatThreadId);
      onSelectSidechat(sidechatThreadId);
    },
    [onSelectSidechat, parentThreadRef, reopenSidechatTab],
  );

  const handleTabContextMenu = useCallback(
    async (event: ReactMouseEvent, sidechatThreadId: ThreadId) => {
      const api = readLocalApi();
      if (!api) return;
      event.preventDefault();
      event.stopPropagation();

      const tabIndex = openTabs.findIndex((tab) => tab.id === sidechatThreadId);
      const items: ContextMenuItem<SidechatTabContextMenuAction>[] = [
        { id: "close", label: "Close tab" },
        { id: "close-others", label: "Close other tabs", disabled: openTabs.length <= 1 },
        {
          id: "close-to-right",
          label: "Close tabs to the right",
          disabled: tabIndex < 0 || tabIndex >= openTabs.length - 1,
        },
        { id: "promote", label: "Promote to thread" },
        { id: "delete", label: "Delete sidechat" },
      ];
      const action = await api.contextMenu.show(items, { x: event.clientX, y: event.clientY });
      const sidechatRef = scopeThreadRef(parentThreadRef.environmentId, sidechatThreadId);
      switch (action) {
        case "close":
          closeTab(sidechatThreadId);
          break;
        case "close-others":
          for (const tab of openTabs) {
            if (tab.id !== sidechatThreadId) closeSidechatTab(parentThreadRef, tab.id);
          }
          if (activeSidechatId !== null && activeSidechatId !== sidechatThreadId) {
            onSelectSidechat(sidechatThreadId);
          }
          break;
        case "close-to-right": {
          const closing = tabIndex >= 0 ? openTabs.slice(tabIndex + 1) : [];
          for (const tab of closing) {
            closeSidechatTab(parentThreadRef, tab.id);
          }
          if (closing.some((tab) => tab.id === activeSidechatId)) {
            onSelectSidechat(sidechatThreadId);
          }
          break;
        }
        case "promote":
          promoteSidechat(parentThreadRef, sidechatRef);
          selectFallbackAfterHide(sidechatThreadId);
          break;
        case "delete":
          selectFallbackAfterHide(sidechatThreadId);
          await confirmAndDeleteThread(sidechatRef);
          break;
        case null:
          break;
      }
    },
    [
      activeSidechatId,
      closeSidechatTab,
      closeTab,
      confirmAndDeleteThread,
      onSelectSidechat,
      openTabs,
      parentThreadRef,
      promoteSidechat,
      selectFallbackAfterHide,
    ],
  );

  const handleTabMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
  }, []);
  const handleTabAuxClick = useCallback(
    (event: ReactMouseEvent, sidechatThreadId: ThreadId) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      closeTab(sidechatThreadId);
    },
    [closeTab],
  );

  useEffect(() => {
    const activeTab = tabListRef.current?.querySelector<HTMLElement>("[data-active-tab='true']");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSidechatId]);

  if (openTabs.length === 0 && closedTabs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2"
      data-sidechat-tabbar
    >
      <ScrollArea
        ref={tabListRef}
        hideScrollbars
        scrollFade
        className="min-w-0 flex-1 rounded-none"
        data-sidechat-tab-list
      >
        <div className="flex h-full w-max min-w-full items-center gap-1">
          {openTabs.map((tab) => {
            const active = tab.id === activeSidechatId;
            return (
              <div
                key={tab.id}
                data-active-tab={active}
                onMouseDown={handleTabMouseDown}
                onAuxClick={(event) => handleTabAuxClick(event, tab.id)}
                onContextMenu={(event) => void handleTabContextMenu(event, tab.id)}
                className={cn(
                  "group flex h-7 min-w-25 max-w-44 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5"
                        onClick={() => onSelectSidechat(tab.id)}
                      >
                        <MessageSquareText className="size-3.5 shrink-0" />
                        <span className="truncate">{tab.title}</span>
                      </button>
                    }
                  />
                  <TooltipPopup>{tab.title}</TooltipPopup>
                </Tooltip>
                <button
                  type="button"
                  className="relative flex size-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Close ${tab.title}`}
                  onClick={() => closeTab(tab.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
          {closedTabs.length > 0 ? (
            <Menu>
              <MenuTrigger
                className="relative inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Reopen closed sidechat"
              >
                <History className="size-3.5" />
                {closedTabs.length}
              </MenuTrigger>
              <MenuPopup align="start" side="bottom" sideOffset={6} className="min-w-44">
                {closedTabs.map((tab) => (
                  <MenuItem key={tab.id} onClick={() => reopenTab(tab.id)}>
                    <MessageSquareText />
                    <span className="truncate">{tab.title}</span>
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  aria-label="New sidechat"
                  disabled={props.spawnDisabled}
                  onClick={props.onSpawnSidechat}
                >
                  <Plus className="size-4" />
                </button>
              }
            />
            <TooltipPopup>New sidechat</TooltipPopup>
          </Tooltip>
        </div>
      </ScrollArea>
    </div>
  );
}
