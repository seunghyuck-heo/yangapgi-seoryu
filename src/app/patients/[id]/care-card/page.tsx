import CareCardForm from "@/components/CareCardForm";
import { getDocument } from "@/lib/db/documents";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchCustomerRowsCached, findCustomer } from "@/lib/google/customerSheet";

interface PageProps {
  params: Promise<{ id: string }>;
}

const pick13 = (v: unknown): string => {
  const d = typeof v === "string" ? v.replace(/\D/g, "") : "";
  return d.length === 13 ? d : "";
};

// 환자관리카드 '기기 관리번호' = 구글시트(고객파일) I열 공단관리번호.
// 이름 + 주민번호(동명이인 안전)로 시트에서 찾아 디폴트로 채운다(편집 불가). 못 찾으면 "".
async function getGongdanNo(id: string): Promise<string> {
  try {
    const supabase = await getSupabaseServerClient();
    const [patientRes, idCard, subsidy, poa] = await Promise.all([
      supabase.from("patients").select("name").eq("id", id).maybeSingle(),
      getDocument(id, "id_card"),
      getDocument(id, "subsidy_application"),
      getDocument(id, "power_of_attorney"),
    ]);
    const name = (patientRes.data as { name?: string } | null)?.name ?? "";
    if (!name || name === "새 환자") return "";
    const customerNo =
      typeof idCard?.form_data?.customer_no === "number" ? (idCard.form_data.customer_no as number) : null;
    // 주민번호: 시트에서 받은 id_card.rrn → 직원 입력 급여/위임 주민번호 순으로 13자리 확보
    const rrn =
      pick13(idCard?.form_data?.rrn) ||
      pick13(subsidy?.form_data?.patient_rrn) ||
      pick13(poa?.form_data?.insured_rrn);
    const rows = await fetchCustomerRowsCached();
    const c = findCustomer(rows, { customerNo, name, rrn });
    return (c?.gongdanNo ?? "").trim();
  } catch {
    return "";
  }
}

export default async function CareCardPage({ params }: PageProps) {
  const { id } = await params;
  const gongdanNo = await getGongdanNo(id);
  return <CareCardForm patientId={id} backHref={`/patients/${id}`} gongdanNo={gongdanNo} />;
}
