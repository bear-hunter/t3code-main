import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ThreadId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import { resolveThreadRouteRef, resolveThreadRouteRenderState } from "../threadRoutes";
import { resolveThreadSyncPhase } from "../threadSync";
import { SidebarInset } from "~/components/ui/sidebar";
import {
  useEnvironmentThreadRefs,
  useThreadDetail,
  useThreadShell,
  useThreadStatus,
} from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const sidechatSearchParam = Route.useSearch({ select: (search) => search.sidechat ?? null });
  const shell = useEnvironmentQuery(
    threadRef === null ? null : environmentShell.stateAtom(threadRef.environmentId),
  );
  const serverThreadShell = useThreadShell(threadRef);
  const serverThreadDetail = useThreadDetail(threadRef);
  const serverThreadStatus = useThreadStatus(threadRef);
  // ?sidechat= selects which tab of the routed thread is displayed. The param
  // only takes effect once the referenced thread is a live sidechat of the
  // routed thread; until then (or if it never is) the Main tab renders, so a
  // stale or foreign id degrades gracefully instead of erroring.
  const requestedSidechatRef =
    threadRef && sidechatSearchParam
      ? scopeThreadRef(threadRef.environmentId, sidechatSearchParam as ThreadId)
      : null;
  const requestedSidechatShell = useThreadShell(requestedSidechatRef);
  const displayedThreadRef =
    requestedSidechatRef &&
    threadRef &&
    requestedSidechatShell?.parentThreadId === threadRef.threadId
      ? requestedSidechatRef
      : threadRef;
  const displayedThreadShell = useThreadShell(displayedThreadRef);
  const displayedThreadDetail = useThreadDetail(displayedThreadRef);
  const displayedThreadStatus = useThreadStatus(displayedThreadRef);
  const environmentThreadRefs = useEnvironmentThreadRefs(threadRef?.environmentId ?? null);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const environmentHasServerThreads = environmentThreadRefs.length > 0;
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadShellExists: serverThreadShell !== null,
    serverThreadDetailExists: serverThreadDetail !== null,
    serverThreadDetailDeleted: serverThreadStatus === "deleted",
    draftThreadExists,
  });
  const threadSyncPhase = resolveThreadSyncPhase({
    detailExists: displayedThreadDetail !== null,
    shellExists: displayedThreadShell !== null,
    status: displayedThreadStatus,
  });
  const serverThreadStarted = threadHasStarted(serverThreadDetail);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    if (renderState === "missing" && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, renderState, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread, serverThreadStarted, threadRef]);

  if (!threadRef || !displayedThreadRef) {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      {renderState === "ready" || (renderState === "loading" && serverThreadShell !== null) ? (
        <ChatView
          environmentId={threadRef.environmentId}
          threadId={displayedThreadRef.threadId}
          sidechatParentThreadId={threadRef.threadId}
          routeKind="server"
          threadSyncPhase={threadSyncPhase}
        />
      ) : null}
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ChatThreadRouteView,
  validateSearch: (search: Record<string, unknown>): { sidechat?: string } => {
    const sidechat =
      typeof search.sidechat === "string" && search.sidechat.trim().length > 0
        ? search.sidechat
        : undefined;
    return sidechat !== undefined ? { sidechat } : {};
  },
});
