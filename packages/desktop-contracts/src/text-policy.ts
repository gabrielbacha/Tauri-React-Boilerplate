export interface TextPolicy {
  units: "utf16" | "scalar";
  maxTextUnits: number;
  maxTextBytes: number;
  maxTitleUnits: number;
}
export const DEFAULT_TEXT_POLICY: TextPolicy = {
  units: "utf16",
  maxTextUnits: 10000,
  maxTextBytes: 40000,
  maxTitleUnits: 255,
};
export function textWithinLimits(text: string, policy: TextPolicy, title = false): boolean {
  const characters = [...text];
  // Reject lone UTF-16 surrogates; Rust strings cannot contain them.
  if (
    characters.some((character) => {
      const code = character.codePointAt(0)!;
      return code >= 0xd800 && code <= 0xdfff;
    })
  )
    return false;
  const count = policy.units === "scalar" ? characters.length : text.length;
  return (
    count <= (title ? policy.maxTitleUnits : policy.maxTextUnits) &&
    (title || new TextEncoder().encode(text).length <= policy.maxTextBytes)
  );
}
