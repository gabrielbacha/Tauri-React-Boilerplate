import { create } from "zustand"
import { persist } from "zustand/middleware"

// Example Zustand store with localStorage persistence. Replace with your app's
// own slices — keep related state + actions co-located in a single store.
type AppState = {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: "app-store" }
  )
)
