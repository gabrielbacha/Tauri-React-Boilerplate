import type { CSSProperties } from "react"
import { Outlet } from "@tanstack/react-router"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function RootLayout() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--sidebar-width-icon": "4.5rem",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      {/* Full-width drag strip that sits above everything so the window can
          be moved from any top edge region. Traffic-light buttons are OS
          overlays and remain clickable through this strip. */}
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-50 h-[var(--titlebar-height)]"
      />
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="@container/main flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
