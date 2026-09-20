export type TemplateFieldType =
  | "text"
  | "date"
  | "checkbox"
  | "signature"
  | "textarea"
  | "static";

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  default?: string | boolean;
  placeholder?: string;
  note?: string;
  /** static-only: literal text to display instead of an input */
  text?: string;
}

export interface TemplateRow {
  /** left-hand "구분" label spanning the row, as in the original table */
  label?: string;
  fields: TemplateField[];
}

export interface TemplateSection {
  title?: string;
  /** static explanatory / legal text copied verbatim from the original document */
  description?: string;
  rows: TemplateRow[];
}

export type DocType =
  | "id_card"
  | "contract"
  | "subsidy_application"
  | "cms_autopay"
  | "power_of_attorney";

export interface DocumentTemplate {
  docType: Exclude<DocType, "id_card">;
  title: string;
  subtitle?: string;
  sections: TemplateSection[];
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  id_card: "신분증",
  contract: "표준계약서",
  subsidy_application: "급여대상자 등록 신청서",
  cms_autopay: "CMS 자동이체신청서",
  power_of_attorney: "요양비 지급청구 위임장",
};

export const DOC_TYPE_ICONS: Record<DocType, string> = {
  id_card: "🪪",
  contract: "📄",
  subsidy_application: "📝",
  cms_autopay: "💳",
  power_of_attorney: "🖊️",
};

export const DOC_TYPE_ORDER: DocType[] = [
  "id_card",
  "contract",
  "subsidy_application",
  "cms_autopay",
  "power_of_attorney",
];
