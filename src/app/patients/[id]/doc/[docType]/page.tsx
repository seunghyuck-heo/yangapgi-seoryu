import { notFound } from "next/navigation";
import { collectStoragePaths, createSignedUrls, getDocument } from "@/lib/db/documents";
import { getTemplate } from "@/lib/templates";
import { getOverlayDoc } from "@/lib/overlays";
import { DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import TemplateForm from "@/components/TemplateForm";
import OverlayDocumentForm from "@/components/OverlayDocumentForm";
import IdCardUploader from "@/components/IdCardUploader";
import { fetchCustomerRowsCached, findCustomer } from "@/lib/google/customerSheet";

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
    // 이름·주민번호·연락처를 '모든 서류'에 자동 프리필한다(빈 칸만, 편집 가능 — 직원 입력값은 덮지 않음).
    //  · 소스: 등록 시점에 구글시트(고객파일)에서 이름으로 찾아 id_card.form_data 에 저장해 둔 값.
    //    - 이름: patients.name (등록창에서 직접 입력)
    //    - 주민번호(rrn 13자리)·연락처(phone, 010 뒤 8자리): id_card.form_data.rrn / .phone
    //  · 필드에 prefillFrom("patientName"|"rrn"|"phone")이 지정된 칸을 채운다.
    let initialFormData: Record<string, unknown> = document?.form_data ?? {};
    const prefillFields = overlay.fields.filter((f) => f.prefillFrom);
    if (prefillFields.length > 0) {
      const needName = prefillFields.some((f) => f.prefillFrom === "patientName");
      const needCard = prefillFields.some((f) => f.prefillFrom === "rrn" || f.prefillFrom === "birth6" || f.prefillFrom === "phone");
      const [patientName, idCard] = await Promise.all([
        needName ? getPatientName(id) : Promise.resolve(""),
        needCard ? getDocument(id, "id_card") : Promise.resolve(null),
      ]);
      const toLocalPhone = (digits: string) =>
        digits.startsWith("010") ? digits.slice(3) : digits.length > 8 ? digits.slice(-8) : digits;
      let rrn = (() => {
        const d = typeof idCard?.form_data?.rrn === "string" ? (idCard.form_data.rrn as string).replace(/\D/g, "") : "";
        return d.length === 13 ? d : "";
      })();
      let birth6 = rrn ? rrn.slice(0, 6) : (typeof idCard?.form_data?.birth6 === "string" ? (idCard.form_data.birth6 as string).replace(/\D/g, "").slice(0, 6) : "");
      let phone = toLocalPhone(typeof idCard?.form_data?.phone === "string" ? (idCard.form_data.phone as string).replace(/\D/g, "") : "");

      // 영구 안전장치: id_card에 주민번호/연락처가 비어 있으면(예: 구버전 등록, 시트에 뒤늦게 기입)
      // 구글시트(고객파일)에서 직접 보강한다. 고유번호(저장돼 있으면)로 특정 → 동명이인 안전, 없으면 단독 이름.
      const needRrn = prefillFields.some((f) => f.prefillFrom === "rrn");
      const needPhone = prefillFields.some((f) => f.prefillFrom === "phone");
      if ((needRrn && !rrn) || (needPhone && !phone)) {
        try {
          const custNo = typeof idCard?.form_data?.customer_no === "number" ? (idCard.form_data.customer_no as number) : null;
          const rows = await fetchCustomerRowsCached();
          const c = findCustomer(rows, { customerNo: custNo, name: patientName });
          if (c) {
            if (!rrn && c.rrn.length === 13) rrn = c.rrn;
            if (!birth6 && c.birth6) birth6 = c.birth6;
            if (!phone && c.phone) phone = toLocalPhone(c.phone.replace(/\D/g, ""));
          }
        } catch {
          // 시트 조회 실패해도 서식은 열려야 함(직원이 직접 입력 가능)
        }
      }
      const patch: Record<string, unknown> = {};
      for (const f of prefillFields) {
        const cur = initialFormData[f.key];
        if (typeof cur === "string" && cur.trim() !== "") continue; // 이미 입력된 칸은 유지
        const v =
          f.prefillFrom === "patientName" ? patientName : f.prefillFrom === "rrn" ? rrn : f.prefillFrom === "phone" ? phone : birth6;
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
