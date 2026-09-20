import { contractOverlay } from "./contract";
import { subsidyOverlay } from "./subsidy";
import { poaOverlay } from "./poa";
import { cmsOverlay } from "./cms";
import { OverlayDoc } from "./types";

export * from "./types";

export const OVERLAY_DOCS: Record<string, OverlayDoc> = {
  contract: contractOverlay,
  subsidy_application: subsidyOverlay,
  power_of_attorney: poaOverlay,
  cms_autopay: cmsOverlay,
};

export function getOverlayDoc(docType: string): OverlayDoc | undefined {
  return OVERLAY_DOCS[docType];
}
