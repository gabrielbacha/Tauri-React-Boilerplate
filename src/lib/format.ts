const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const

export function formatBytes(bytes: number, opts: { precision?: number } = {}): string {
  const { precision = 1 } = opts
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes === 0) return "0 B"
  const abs = Math.abs(bytes)
  const unit = Math.min(Math.floor(Math.log(abs) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / Math.pow(1024, unit)
  const rounded =
    unit === 0
      ? Math.round(value).toString()
      : value >= 100
        ? value.toFixed(0)
        : value.toFixed(precision)
  return `${rounded} ${UNITS[unit]}`
}

export function formatPercent(value: number, opts: { precision?: number } = {}): string {
  const { precision = 1 } = opts
  if (!Number.isFinite(value)) return "—"
  if (value === 0) return "0%"
  if (value < 0.001) return "<0.1%"
  return `${(value * 100).toFixed(precision)}%`
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? "compact" : "standard" }).format(
    value,
  )
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365.25 * 24 * 60 * 60 * 1000],
  ["month", 30.44 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
]

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

export function formatRelativeTime(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—"
  const diff = ms - Date.now()
  const abs = Math.abs(diff)
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms || unit === "second") {
      const value = Math.round(diff / ms)
      return RTF.format(value, unit)
    }
  }
  return "—"
}

export function formatDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ms)
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—"
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function formatPath(path: string, opts: { maxSegments?: number } = {}): string {
  const { maxSegments = 4 } = opts
  const segments = path.split("/").filter(Boolean)
  if (segments.length <= maxSegments) return path.startsWith("/") ? path : `/${path}`
  const head = segments.slice(0, 1)
  const tail = segments.slice(-(maxSegments - 1))
  return `/${head.join("/")}/…/${tail.join("/")}`
}
