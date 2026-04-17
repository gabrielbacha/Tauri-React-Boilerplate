import { useEffect, useState } from "react"
import {
  BellIcon,
  ClipboardCopyIcon,
  FileSearchIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react"

import { Greet } from "@/components/greet"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Appearance, runtime info, and examples of common Tauri plugins.
        </p>
      </header>

      <AppearanceCard />
      <PluginsCard />

      <Card>
        <CardHeader>
          <CardTitle>Rust bridge</CardTitle>
          <CardDescription>Invoke a Tauri command from the frontend.</CardDescription>
        </CardHeader>
        <CardContent>
          <Greet />
        </CardContent>
      </Card>
    </div>
  )
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Switch between light, dark and system themes. Tip: press{" "}
          <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">D</kbd> to cycle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button
            variant={theme === "light" ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("light")}
          >
            <SunIcon className="size-4" /> Light
          </Button>
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("dark")}
          >
            <MoonIcon className="size-4" /> Dark
          </Button>
          <Button
            variant={theme === "system" ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("system")}
          >
            <MonitorIcon className="size-4" /> System
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PluginsCard() {
  const [osInfo, setOsInfo] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    import("@tauri-apps/plugin-os")
      .then(async (mod) => {
        const platform = await mod.platform()
        const version = await mod.version()
        if (!cancelled) setOsInfo(`${platform} ${version}`)
      })
      .catch(() => {
        if (!cancelled) setOsInfo("unavailable (not running under Tauri)")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenDialog = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({ multiple: false, directory: false })
    toast.success(selected ? `Selected: ${selected}` : "No file selected")
  }

  const handleNotify = async () => {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    )
    const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted"
    if (granted) {
      sendNotification({ title: "Tauri Starter", body: "This is a native notification." })
    } else {
      toast.error("Notification permission denied")
    }
  }

  const handleCopy = async () => {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager")
    await writeText("Hello from Tauri Starter!")
    toast.success("Copied to clipboard")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tauri plugins</CardTitle>
        <CardDescription>
          Try common plugin APIs. Wire only the ones your app needs in{" "}
          <code className="font-mono text-xs">src-tauri/src/lib.rs</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Host OS</Label>
          <p className="font-mono text-sm">{osInfo || "loading…"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenDialog}>
            <FileSearchIcon className="size-4" /> Open dialog
          </Button>
          <Button variant="outline" size="sm" onClick={handleNotify}>
            <BellIcon className="size-4" /> Notify
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <ClipboardCopyIcon className="size-4" /> Copy to clipboard
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
