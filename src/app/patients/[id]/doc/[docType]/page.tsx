import { notFound } from "next/navigation";
import { collectStoragePaths, createSignedUrls, getDocument } from "@/lib/db/documents";
import { getTemplate } from "@/lib/templates";
import { getOverlayDoc } from "@/lib/overlays";
import { DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";
import TemplateForm from "@/components/TemplateForm";
import OverlayDocumentForm from "@/components/OverlayDocumentForm";
import IdCardUploader from "@/components/IdCardUploader";

interface DocPageProps {
  params: Promise<{ id: string; docType: string }>;
  searchParams: Promise<{ from?: string }>;
}

function isValidDocType(value: string): value is DocType {
  // 5개 기본 서류 + 지속관리 서류(contract_after: 순응 후 표준계약서)
  return (DOC_TYPE_ORDER as string[]).includes(value) || value === "contract_after";
}

export default async function DocumentPage({ params, searchParams }: DocPageProps) {
  const { id, docType } = await params;
  const { from } = await searchParams;
  if (!isValidDocType(docType)) notFound();

  const document = await getDocument(id, docType);
  const backHref = from === "submit" ? "/submit" : `/patients/${id}`;

  if (docType === "id_card") {
    const signedUrls = await createSignedUrls(document?.file_path ? [document.file_path] : []);
    return (
      <IdCardUploader
        patientId={id}
        initialUrl={document?.file_path ? signedUrls[document.file_path] : undefined}
        initialStatus={document?.status ?? "draft"}
        backHref={backHref}
      />
    );
  }

  const signedUrls = await createSignedUrls(collectStoragePaths(document));

  const overlay = getOverlayDoc(docType);
  if (overlay) {
    // 신분증 OCR로 읽은 주민번호 전체를 주민번호가 필요한 서식에 미리 채운다(오타·불일치 방지).
    //  · 급여대상자 등록 신청서 → patient_rrn,  요양비 지급청구 위임장 → insured_rrn
    //  · 해당 필드가 비어 있을 때만 채움(직원이 이미 입력/수정한 값은 덮지 않음).
    let initialFormData: Record<string, unknown> = document?.form_data ?? {};
    const rrnField =
      docType === "subsidy_application" ? "patient_rrn" : docType === "power_of_attorney" ? "insured_rrn" : null;
    if (rrnField) {
      const cur = initialFormData[rrnField];
      const alreadyFilled = typeof cur === "string" && cur.trim() !== "";
      if (!alreadyFilled) {
        const idCard = await getDocument(id, "id_card");
        const rrn = idCard?.form_data?.rrn;
        if (typeof rrn === "string" && rrn.replace(/\D/g, "").length === 13) {
          initialFormData = { ...initialFormData, [rrnField]: rrn };
        }
      }
    }
    return (
      <OverlayDocumentForm
        overlay={overlay}
        docType={docType}
        patientId={id}
        initialFormData={initialFormData}
        initialSignedUrls={signedUrls}
        initialStatus={document?.status ?? "draft"}
        backHref={backHref}
      />
    );
  }

  const template = getTemplate(docType);
  if (!template) notFound();

  return (
    <TemplateForm
      template={template}
      patientId={id}
      initialFormData={document?.form_data ?? {}}
      initialSignedUrls={signedUrls}
      initialStatus={document?.status ?? "draft"}
      backHref={backHref}
    />
  );
}
