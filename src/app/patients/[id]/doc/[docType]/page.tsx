import { notFound } from "next/navigation";
import { collectStoragePaths, createSignedUrls, getDocument } from "@/lib/db/documents";
import { getTemplate } from "@/lib/templates";
import { getOverlayDoc } from "@/lib/overlays";
import { DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

// 자동 프리필용 환자 이름(아직 '새 환자'면 빈 값으로 — 잘못 채우지 않도록)
async function getPatientName(id: string): Promise<string> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.from("patients").select("name").eq("id", id).maybeSingle();
    const n = (data as { name?: string } | null)?.name ?? "";
    return n && n !== "새 환자" ? n : "";
  } catch {
    return "";
  }
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
    // 이름·주민번호는 '모든 서류'에 자동 프리필한다(빈 칸만, 편집 가능 — 직원 입력값은 덮지 않음).
    //  · 소스: 환자 이름(patients.name), 주민번호 전체(신분증 OCR → id_card form_data.rrn).
    //  · 필드에 prefillFrom("patientName"|"rrn"|"birth6")이 지정된 칸을 채운다.
    let initialFormData: Record<string, unknown> = document?.form_data ?? {};
    const prefillFields = overlay.fields.filter((f) => f.prefillFrom);
    if (prefillFields.length > 0) {
      const needName = prefillFields.some((f) => f.prefillFrom === "patientName");
      const needRrn = prefillFields.some((f) => f.prefillFrom === "rrn" || f.prefillFrom === "birth6");
      const [patientName, idCard] = await Promise.all([
        needName ? getPatientName(id) : Promise.resolve(""),
        needRrn ? getDocument(id, "id_card") : Promise.resolve(null),
      ]);
      const rrnRaw = typeof idCard?.form_data?.rrn === "string" ? (idCard.form_data.rrn as string).replace(/\D/g, "") : "";
      const rrn = rrnRaw.length === 13 ? rrnRaw : "";
      const idBirth6 = typeof idCard?.form_data?.birth6 === "string" ? (idCard.form_data.birth6 as string).replace(/\D/g, "").slice(0, 6) : "";
      const birth6 = rrn ? rrn.slice(0, 6) : idBirth6;
      const patch: Record<string, unknown> = {};
      for (const f of prefillFields) {
        const cur = initialFormData[f.key];
        if (typeof cur === "string" && cur.trim() !== "") continue; // 이미 입력된 칸은 유지
        const v = f.prefillFrom === "patientName" ? patientName : f.prefillFrom === "rrn" ? rrn : birth6;
        if (v) patch[f.key] = v;
      }
      if (Object.keys(patch).length) initialFormData = { ...initialFormData, ...patch };
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
