import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { Providers } from "@/components/providers"
import { DebugPanel } from "@/components/debug-panel"
import { router } from "@/app/router"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      {import.meta.env.DEV ? <DebugPanel /> : null}
      <main data-ui-scroll-container>
        <RouterProvider router={router} />
      </main>
    </Providers>
  </StrictMode>
)
