// LayoutStore.js
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export const LAYOUTS = [
  "sidebar-panel",
  "sidebar-panel-float",
  // "sidebar-collapse",
  // "sideblock",
  "top-navigation",
] as const;

export type LayoutType = (typeof LAYOUTS)[number];

type LayoutStore = {
  activeLayout: LayoutType;
  setActiveLayout: (layout: LayoutType) => void;
};

export const useLayoutStore = create<LayoutStore>()(
  immer((set) => ({
    activeLayout: "sidebar-panel",

    setActiveLayout: (layout: LayoutType) => {
      set((state) => {
        state.activeLayout = layout;
      });

      // Only set in browser context
      if (typeof window !== "undefined") {
        localStorage.setItem("PREFERED_LAYOUT", layout);
      }
    },
  }))
);

// Utility function for client-side initialization
export const restoreLayoutFromStorage = () => {
  if (typeof window !== "undefined") {
    const prefferedLayout = localStorage.getItem("PREFERED_LAYOUT");
    if (prefferedLayout) {
      const { setActiveLayout } = useLayoutStore.getState();
      setActiveLayout(prefferedLayout as LayoutType);
    }
  }
};
