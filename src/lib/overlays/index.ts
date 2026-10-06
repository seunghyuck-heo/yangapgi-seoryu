import { contractOverlay } from "./contract";
import { subsidyOverlay } from "./subsidy";
import { poaOverlay } from "./poa";
import { cmsOverlay } from "./cms";
import { OverlayDoc } from "./types";

export * from "./types";

export const OVERLAY_DOCS: Record<string, OverlayDoc> = {
  contract: contractOverlay,
  // 순응 후 표준계약서: 표준계약서와 동일한 서식·편집내용을 그대로 재사용(저장 슬롯만 분리)
  contract_after: contractOverlay,
  subsidy_application: subsidyOverlay,
  power_of_attorney: poaOverlay,
  cms_autopay: cmsOverlay,
};

export function getOverlayDoc(docType: string): OverlayDoc | undefined {
  return OVERLAY_DOCS[docType];
}
