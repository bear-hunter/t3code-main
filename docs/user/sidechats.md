# Sidechats

A sidechat is a side conversation spawned from a thread. It starts with everything said in the
main chat so far, so you can ask questions or explore an idea with full context — without the
main conversation ever seeing it. Use one to ask "what does this error mean?" mid-task, compare
approaches, or take a tangent you don't want cluttering the main thread.

## How they work

A sidechat is a real thread with its own agent session. On Claude, the sidechat's session is a
**native fork** of the main chat's session: when you send your first message, the agent starts
already holding the full conversation state — including tool calls and files it has read — and
nothing is copied into your message. On providers without session forking (Codex, Cursor, Grok,
OpenCode), T3 Code instead prefixes a transcript of the main chat (the most recent part, if the
conversation is very long) to your first message. Either way, from then on the two conversations
are fully separate: nothing you do in a sidechat continues the main chat, and the main chat's
later messages don't appear in the sidechat.

Sidechats appear as a tab strip at the top of the chat: a **Main** tab plus one tab per sidechat.
Chatting always goes to the active tab. The strip only appears once a thread has sidechats.

Sidechats run in the same branch and working directory as their parent. If both the main chat and
a sidechat edit files at the same time, they are editing the same checkout — sidechats are at
their best for questions and exploration alongside file-editing work in the main tab.

## Starting a sidechat

From a thread that has started, any of:

- The **+** button on the tab strip.
- **New sidechat** in the command palette.
- The `Chat: New Sidechat` keyboard shortcut (`mod+shift+s` by default).

The new tab opens with an empty composer; the main chat's context is attached automatically when
you send your first message. Sidechats title themselves from that first message.

## Closing, reopening, and deleting

- **Close a tab** with its × or a middle-click. Closing hides the tab without deleting anything —
  reopen it any time from the clock menu at the end of the strip.
- **Delete a sidechat** from the tab's right-click menu (desktop). Deleting a thread that has
  sidechats deletes those sidechats with it; the confirmation says so.
- **Promote to thread** (tab right-click menu, desktop) turns a sidechat back into a regular
  sidebar thread — it was a full thread all along, this just moves where it appears.

Sidechats stay out of the sidebar and the command palette's thread lists; they live in their
parent's tab strip. Because they are ordinary threads underneath, a sidechat opened on one device
is visible from your other devices too — on mobile, sidechats appear indented beneath their
parent in the thread list, ready to read and continue. Starting new sidechats from mobile is not
available yet.
