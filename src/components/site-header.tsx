import { useRouterState } from "@tanstack/react-router"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const TITLES: Record<string, string> = {
  "/": "Home",
  "/dashboard": "Dashboard",
  "/settings": "Settings",
}

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const title = TITLES[pathname] ?? "—"

  return (
    <header
      data-tauri-drag-region
      className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)"
    >
      <div
        data-tauri-drag-region
        className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6"
      >
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="font-heading text-base font-medium">{title}</h1>
      </div>
    </header>
  )
}
