const encoder = new TextEncoder();
const SECRET_KEY = /password|passwd|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key/i;

function boundedText(text: string, bytes: number): string {
  let result = text.slice(0, bytes);
  while (encoder.encode(result).byteLength > bytes) result = result.slice(0, -1);
  return result;
}
function redact(text: string): string {
  return text
    .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(password|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[URL]";
      }
    });
}

/** Limits work as well as output. Does not call getters or toJSON methods. */
export function boundedDebugValue(value: unknown, maxBytes = 8192): unknown {
  const seen = new WeakSet<object>();
  let nodes = 0;
  function visit(input: unknown, depth: number): unknown {
    if (++nodes > 128 || depth > 5) return "[Truncated]";
    if (input === null || input === undefined) return null;
    if (typeof input === "boolean" || typeof input === "number") return input;
    if (typeof input === "string") return redact(boundedText(input, 512));
    if (typeof input !== "object") return `[${typeof input}]`;
    if (seen.has(input)) return "[Circular]";
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        const output: unknown[] = [];
        for (let i = 0; i < Math.min(input.length, 32); i += 1) {
          const entry = Object.getOwnPropertyDescriptor(input, String(i));
          output.push(!entry ? null : "value" in entry ? visit(entry.value, depth + 1) : "[Accessor]");
        }
        return output;
      }
      const output: Record<string, unknown> = Object.create(null);
      let fields = 0;
      for (const key in input) {
        if (fields >= 32) break;
        const entry = Object.getOwnPropertyDescriptor(input, key);
        if (!entry) continue;
        fields += 1;
        output[boundedText(key, 128)] = SECRET_KEY.test(key)
          ? "[REDACTED]"
          : "value" in entry
            ? visit(entry.value, depth + 1)
            : "[Accessor]";
      }
      return output;
    } catch {
      return "[Unavailable]";
    }
  }
  const output = visit(value, 0);
  const json = JSON.stringify(output);
  if (encoder.encode(json).byteLength <= maxBytes) return output;
  // Truncate only the already bounded/redacted representation.
  const truncated = { truncated: true, preview: boundedText(json, Math.max(0, maxBytes - 128)) };
  while (encoder.encode(JSON.stringify(truncated)).byteLength > maxBytes && truncated.preview.length) {
    truncated.preview = truncated.preview.slice(0, -128);
  }
  return truncated;
}

export function debugText(value: unknown, maxBytes = 8192): string {
  const output = boundedDebugValue(value, maxBytes);
  return typeof output === "string" ? output : JSON.stringify(output);
}
