export type DesktopPlatform = "darwin" | "win32" | "linux";
export function desktopPlatform(value: string): DesktopPlatform {
  if (value === "darwin" || value === "win32" || value === "linux") return value;
  throw new Error("Unsupported desktop platform.");
}
