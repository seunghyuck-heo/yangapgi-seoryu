import { contractOverlay, contractAfterOverlay } from "./contract";
import { subsidyOverlay } from "./subsidy";
import { poaOverlay } from "./poa";
import { cmsOverlay } from "./cms";
import { OverlayDoc } from "./types";

export * from "./types";

export const OVERLAY_DOCS: Record<string, OverlayDoc> = {
  contract: contractOverlay,
  // 순응 후 표준계약서: 표준계약서와 동일하되 대여 종료일만 시작일+1년(순응 전은 +90일)
  contract_after: contractAfterOverlay,
  subsidy_application: subsidyOverlay,
  power_of_attorney: poaOverlay,
  cms_autopay: cmsOverlay,
};

export function getOverlayDoc(docType: string): OverlayDoc | undefined {
  return OVERLAY_DOCS[docType];
}
