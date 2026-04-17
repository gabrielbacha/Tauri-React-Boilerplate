import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, LayoutDashboardIcon, SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <span className="w-fit rounded-full border bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Tauri Starter
        </span>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight">
          A blank slate <span className="text-primary">ready to ship</span>.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          React 19, Tauri 2, TanStack Router + Query, Zustand, shadcn/ui and a custom debug
          panel. Edit <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">src/app/pages/home.tsx</code>{" "}
          to start.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="group transition-colors hover:border-primary/40">
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LayoutDashboardIcon className="size-4" />
            </div>
            <CardTitle className="mt-3">Dashboard example</CardTitle>
            <CardDescription>
              Cards, interactive charts and a drag-sortable table using @tanstack/react-table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">
                View example
                <ArrowRightIcon className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="group transition-colors hover:border-primary/40">
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SettingsIcon className="size-4" />
            </div>
            <CardTitle className="mt-3">Tauri playground</CardTitle>
            <CardDescription>
              Invoke Rust commands, toggle theme, and try plugins (dialog, notification, clipboard).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">
                Open settings
                <ArrowRightIcon className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-xl border bg-card/60 p-5 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">What's wired up</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          <li>— Type-safe routing (TanStack Router)</li>
          <li>— Server state (TanStack Query)</li>
          <li>— Global state (Zustand)</li>
          <li>— Forms (react-hook-form + zod)</li>
          <li>— Error boundary + typed env</li>
          <li>— Dark / light / system theme</li>
          <li>— External link guard for Tauri</li>
          <li>— Dev-only debug panel (Cmd/Ctrl+D)</li>
        </ul>
      </section>
    </div>
  )
}
