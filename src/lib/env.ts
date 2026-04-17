import { z } from "zod"

// Extend with your own VITE_-prefixed variables. Vite only exposes those at
// `import.meta.env`. Parse once at startup so a missing or malformed var fails
// loudly instead of showing up as a runtime `undefined`.
const envSchema = z.object({
  VITE_APP_NAME: z.string().default("Tauri Starter"),
  VITE_API_URL: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const parsed = envSchema.safeParse(import.meta.env)
  if (!parsed.success) {
    console.error("✖ Invalid environment variables:", parsed.error.flatten().fieldErrors)
    throw new Error("Invalid environment variables. See console for details.")
  }
  return parsed.data
}

export const env = parseEnv()
