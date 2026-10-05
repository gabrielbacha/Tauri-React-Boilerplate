// Shared identity rules. Keep this module dependency-free so setup works before installation.
export const PACKAGE_NAME = /^[a-z][a-z0-9-]*$/;
export const APP_ID = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/;
export const PROTOCOL = /^[a-z][a-z0-9-]*$/;
export const STORAGE_NAMESPACE = /^[a-z][a-z0-9._-]*$/;
export const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
// Match the verifier's existing practical email validation without importing Zod during setup.
export const EMAIL =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
const RESERVED_PROTOCOLS = new Set(["app", "http", "https", "file", "data", "javascript", "tauri", "asset", "ipc"]);

export const validProductName = (value) =>
  typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 80;
export const validProtocol = (value) => PROTOCOL.test(value) && !RESERVED_PROTOCOLS.has(value);
export const validHttpsUrl = (value) => {
  const url = URL.parse(value);
  return url !== null && url.protocol === "https:" && !url.username && !url.password;
};
