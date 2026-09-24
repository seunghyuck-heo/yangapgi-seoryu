"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PatientWithDocuments, PatientDocument } from "@/lib/db/types";
import { DocType } from "@/lib/templates/types";

interface CareCardFormProps {
  patientId: string;
  backHref: string;
}

const CALL_CENTER = "010-5966-2460";

function fd(docs: PatientDocument[], type: DocType): Record<string, unknown> {
  const d = docs.find((x) => x.doc_type === type);
  return (d?.form_data as Record<string, unknown>) ?? {};
}

function firstStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

// 주민번호/생년월일 문자열 → "YYYY.MM.DD"
function formatBirth(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return raw.trim();
  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const g = digits[6];
  let century: string;
  if (g === "1" || g === "2" || g === "5" || g === "6") century = "19";
  else if (g === "3" || g === "4" || g === "7" || g === "8") century = "20";
  else century = parseInt(yy, 10) > 30 ? "19" : "20";
  return `${century}${yy}.${mm}.${dd}`;
}

// 양압기 환자관리카드 (별지 제5호 서식) — A4 한 장. 기본정보는 환자 서류에서 자동 채움.
export default function CareCardForm({ patientId, backHref }: CareCardFormProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientWithDocuments | null>(null);

  useEffect(() => {
    fetch(`/api/patients/${patientId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.patient) setPatient(json.patient);
      })
      .catch(() => {});
  }, [patientId]);

  const docs = patient?.documents ?? [];
  const subsidy = fd(docs, "subsidy_application");
  const poa = fd(docs, "power_of_attorney");
  const cms = fd(docs, "cms_autopay");

  const name = patient
    ? firstStr(patient.name, subsidy.patient_name, poa.insured_name, cms.applicant_name)
    : "";
  const birthRaw = patient
    ? firstStr(patient.resident_number, subsidy.patient_rrn, poa.insured_rrn, cms.payer_birth)
    : "";
  const birth = birthRaw ? formatBirth(birthRaw) : "";
  const phone = patient
    ? firstStr(patient.phone, subsidy.patient_mobile_phone, poa.delegator_phone, cms.account_holder_phone)
    : "";

  const visitRows = Array.from({ length: 12 });

  return (
    <div className="doc-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="doc-page__back" onClick={() => router.push(backHref)}>
          ← 목록으로
        </button>
        <button type="button" onClick={() => window.print()}>
          인쇄 (A4)
        </button>
      </div>

      <div className="carecard-wrap">
        <div className="carecard-page">
          {/* 상단 머리말 */}
          <div className="cc-top">
            <span className="cc-top__form">[별지 제5호 서식]</span>
            <span className="cc-top__keep">(업체보관용)</span>
          </div>
          <h1 className="cc-title">양압기 환자관리카드</h1>
          <div className="cc-subrow">
            <span className="cc-note">
              ※ 자세한 유의사항 및 작성방법은 본 환자관리카드 서식의 뒤쪽 설명란을 참고하여 주시기 바랍니다.
            </span>
            <span className="cc-page">(앞 쪽)</span>
          </div>

          {/* ① 기본정보 */}
          <div className="cc-sec">① 기본정보</div>
          <table className="cc-table cc-basic">
            <tbody>
              <tr>
                <th className="cc-cat">환자</th>
                <td className="cc-lbl">성명</td>
                <td className="cc-val">{name}</td>
                <td className="cc-lbl">생년월일</td>
                <td className="cc-val">{birth}</td>
                <td className="cc-lbl">연락처</td>
                <td className="cc-val">{phone}</td>
              </tr>
              <tr>
                <th className="cc-cat">준요양기관</th>
                <td className="cc-lbl">상호명</td>
                <td className="cc-val" />
                <td className="cc-lbl">연락처</td>
                <td className="cc-val" />
                <td className="cc-lbl">콜센터 번호</td>
                <td className="cc-val">{CALL_CENTER}</td>
              </tr>
              <tr>
                <th className="cc-cat">기기정보</th>
                <td className="cc-lbl">기기 관리번호</td>
                <td className="cc-val" />
                <td className="cc-lbl">제품명</td>
                <td className="cc-val" />
                <td className="cc-lbl">계약기간</td>
                <td className="cc-val" />
              </tr>
            </tbody>
          </table>

          {/* ② 장비설치 전 성능검사 */}
          <div className="cc-sec">② 장비설치 전 성능검사</div>
          <table className="cc-table cc-insp">
            <tbody>
              <tr>
                <th className="cc-cat cc-cat--xs">날짜</th>
                <td className="cc-val cc-date" />
                <th className="cc-cat cc-cat--xs">점검내용</th>
                <td className="cc-check cc-check--wide">[ ] 장비기능 &nbsp; [ ] 알람기능 &nbsp; [ ] 소독·세척</td>
                <th className="cc-cat cc-cat--xs">점검자 서명</th>
                <td className="cc-val cc-sign" />
              </tr>
            </tbody>
          </table>

          {/* ③ 안전교육 */}
          <div className="cc-sec">③ 안전교육</div>
          <table className="cc-table cc-insp">
            <tbody>
              <tr>
                <th className="cc-cat cc-cat--xs">날짜</th>
                <td className="cc-val cc-date" />
                <th className="cc-cat cc-cat--xs">교육내용</th>
                <td className="cc-check cc-check--wide">[ ] 장비사용법 &nbsp; [ ] 응급상황 시 대처요령 &nbsp; [ ] 기타</td>
                <th className="cc-cat cc-cat--xs">환자 서명</th>
                <td className="cc-val cc-sign" />
              </tr>
            </tbody>
          </table>

          {/* ④ 방문점검 서비스 기록 */}
          <div className="cc-sec">④ 방문점검 서비스 기록</div>
          <table className="cc-table cc-visit">
            <thead>
              <tr>
                <th rowSpan={2} className="cc-vh cc-vh--date">날짜</th>
                <th colSpan={3} className="cc-vh">방문점검</th>
                <th colSpan={3} className="cc-vh">방문 또는 유선점검</th>
                <th className="cc-vh">점검결과</th>
                <th colSpan={2} className="cc-vh">점검확인 서명</th>
              </tr>
              <tr>
                <th className="cc-vh cc-vh--sub">양압기 점검</th>
                <th className="cc-vh cc-vh--sub">소모품 점검</th>
                <th className="cc-vh cc-vh--sub">위생상태 점검</th>
                <th className="cc-vh cc-vh--sub">알람기능 작동여부</th>
                <th className="cc-vh cc-vh--sub">설정압력 유지여부</th>
                <th className="cc-vh cc-vh--sub">사용시간/ 사용상태</th>
                <th className="cc-vh cc-vh--sub">조치사항 (소독 및 소모품 교체 등)</th>
                <th className="cc-vh cc-vh--sub">준요양기관</th>
                <th className="cc-vh cc-vh--sub">환자(가족)</th>
              </tr>
            </thead>
            <tbody>
              {visitRows.map((_, i) => (
                <tr key={i}>
                  <td className="cc-vr cc-vr--date" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                </tr>
              ))}
            </tbody>
          </table>

          {/* ⑤ 설치 및 회수확인 */}
          <div className="cc-sec">⑤ 설치 및 회수확인</div>
          <table className="cc-table">
            <tbody>
              <tr>
                <th className="cc-cat cc-cat--sm">설치일자</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">회수일자</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">준요양기관</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">환자(가족)</th>
                <td className="cc-val" />
              </tr>
              <tr>
                <th className="cc-cat cc-cat--sm">기타사항</th>
                <td className="cc-val" colSpan={7} />
              </tr>
            </tbody>
          </table>

          <div className="cc-foot">210㎜ × 297㎜ [백상지(80g/㎡) 또는 중질지(80g/㎡)]</div>
        </div>
      </div>
    </div>
  );
}
