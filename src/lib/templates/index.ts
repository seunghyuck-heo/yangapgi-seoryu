import { contractTemplate } from "./contract";
import { subsidyTemplate } from "./subsidy";
import { cmsTemplate } from "./cms";
import { poaTemplate } from "./poa";
import { DocumentTemplate } from "./types";

export * from "./types";

export const TEMPLATES: Record<DocumentTemplate["docType"], DocumentTemplate> = {
  contract: contractTemplate,
  subsidy_application: subsidyTemplate,
  cms_autopay: cmsTemplate,
  power_of_attorney: poaTemplate,
};

export function getTemplate(docType: string): DocumentTemplate | undefined {
  return (TEMPLATES as Record<string, DocumentTemplate>)[docType];
}
