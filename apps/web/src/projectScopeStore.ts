/**
 * Zustand store for the sidebar's project scope filter.
 *
 * Lives outside SidebarV2 so other surfaces (keyboard shortcuts, new-thread
 * entry points) can respect the scoped project instead of prompting for one.
 * `null` means "All projects".
 */
import { create } from "zustand";

interface ProjectScopeStore {
  projectScopeKey: string | null;
  setProjectScopeKey: (key: string | null) => void;
}

export const useProjectScopeStore = create<ProjectScopeStore>((set) => ({
  projectScopeKey: null,
  setProjectScopeKey: (key) => set({ projectScopeKey: key }),
}));
