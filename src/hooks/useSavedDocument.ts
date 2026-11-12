import { toast } from "sonner";

import { useSavedDocument as usePortableSavedDocument } from "../../packages/desktop-contracts/src/useSavedDocument";
export function useSavedDocument(): ReturnType<typeof usePortableSavedDocument> {
  return usePortableSavedDocument(window.desktop, toast);
}
