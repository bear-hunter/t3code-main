// Tiny event bus letting entry points outside ChatView (command palette,
// future surfaces) ask the mounted chat view to spawn a sidechat of its
// routed thread. ChatView owns the spawn flow because it already holds the
// parent thread detail, command atoms, and tab navigation.
const SIDECHAT_SPAWN_EVENT = "t3code:spawn-sidechat";

export function requestSpawnSidechat(): void {
  window.dispatchEvent(new CustomEvent(SIDECHAT_SPAWN_EVENT));
}

export function onSpawnSidechatRequest(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(SIDECHAT_SPAWN_EVENT, handler);
  return () => window.removeEventListener(SIDECHAT_SPAWN_EVENT, handler);
}
