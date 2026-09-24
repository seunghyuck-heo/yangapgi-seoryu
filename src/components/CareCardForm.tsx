"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PatientWithDocuments, PatientDocument } from "@/lib/db/types";
import { DocType } from "@/lib/templates/types";
import { PATIENTS_CHANGED_EVENT } from "./BottomTabs";
import CareCardZoom from "./CareCardZoom";
import SignaturePad from "./SignaturePad";

interface CareCardFormProps {
  patientId: string;
  backHref: string;
}

const CALL_CENTER = "010-5966-2460";
const VISIT_COUNT = 12;

const PROVIDERS = ["한혜리", "백영신"];
const ACTION_MAX = 150;

interface Visit {
  date: string; // YYYY-MM-DD
  cpap: boolean; // 양압기 점검
  supply: boolean; // 소모품 점검
  hygiene: boolean; // 위생상태 점검
  alarm: boolean; // 알람기능 작동여부
  pressure: boolean; // 설정압력 유지여부
  usage: string; // 사용시간 (1~12)
  action: string; // 조치사항 (최대 150자)
  provider: string; // 준요양기관 점검자 (한혜리/백영신)
  guardianSign: string; // 환자(가족) 서명 이미지(data URL)
}

function blankVisit(): Visit {
  return {
    date: "",
    cpap: false,
    supply: false,
    hygiene: false,
    alarm: false,
    pressure: false,
    usage: "",
    action: "",
    provider: "",
    guardianSign: "",
  };
}

function normalizeVisits(raw: unknown): Visit[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Visit[] = [];
  for (let i = 0; i < VISIT_COUNT; i++) {
    const v = (arr[i] ?? {}) as Partial<Visit>;
    out.push({
      date: typeof v.date === "string" ? v.date : "",
      cpap: !!v.cpap,
      supply: !!v.supply,
      hygiene: !!v.hygiene,
      alarm: !!v.alarm,
      pressure: !!v.pressure,
      usage: typeof v.usage === "string" ? v.usage : v.usage != null ? String(v.usage) : "",
      action: typeof v.action === "string" ? v.action : "",
      provider: typeof v.provider === "string" ? v.provider : "",
      guardianSign: typeof v.guardianSign === "string" ? v.guardianSign : "",
    });
  }
  return out;
}

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

// 전화번호 → 010-XXXX-XXXX
function formatPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  // 서류 필드는 앞자리(010-)를 제외한 8자리로 저장됨 → 010 보정
  if (d.length === 8) d = "010" + d;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw.trim();
}

// YYYY-MM-DD → YY.MM.DD (방문점검 표 좁은 칸용)
function fmtVisitDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

// 양압기 환자관리카드 (별지 제5호 서식) — 다른 서류와 동일한 작성/수정 흐름.
export default function CareCardForm({ patientId, backHref }: CareCardFormProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientWithDocuments | null>(null);
  const [visits, setVisits] = useState<Visit[]>(() => Array.from({ length: VISIT_COUNT }, blankVisit));
  const [status, setStatus] = useState<"draft" | "completed">("draft");
  const [localEdit, setLocalEdit] = useState(false); // 완료 화면에서 '수정' 눌렀을 때
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const editSnapshotRef = useRef<string>("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 편집 팝업들
  const [actionRow, setActionRow] = useState<number | null>(null); // 조치사항 입력
  const [providerRow, setProviderRow] = useState<number | null>(null); // 준요양기관 선택
  const [providerDraft, setProviderDraft] = useState("");
  const [signRow, setSignRow] = useState<number | null>(null); // 환자(가족) 서명

  useEffect(() => {
    fetch(`/api/patients/${patientId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.patient) {
          const p = json.patient as PatientWithDocuments;
          setPatient(p);
          const cc = p.documents.find((d) => d.doc_type === "care_card");
          if (cc) {
            if (cc.status === "completed") setStatus("completed");
            const raw = (cc.form_data as Record<string, unknown>)?.visits;
            if (raw) setVisits(normalizeVisits(raw));
          }
        }
      })
      .catch(() => {});
  }, [patientId]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  const isCompleted = status === "completed";
  const editing = !isCompleted || localEdit; // 셀 편집 가능 여부
  const mode: "green" | "blue" | null = localEdit ? "green" : !isCompleted ? "blue" : null;

  const update = useCallback((i: number, patch: Partial<Visit>) => {
    setVisits((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }, []);

  async function putCard(targetStatus: "draft" | "completed"): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${patientId}/care_card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: { visits }, status: targetStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "저장에 실패했습니다");
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }

  // 하단: 임시저장 / 작성 완료
  async function handleSubmit(targetStatus: "draft" | "completed") {
    const ok = await putCard(targetStatus);
    if (!ok) return;
    if (targetStatus === "completed") {
      setStatus("completed");
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
      }
      router.push(backHref === "/submit" ? "/patients" : backHref);
    } else {
      showToast("임시저장되었습니다.");
    }
  }

  // 상단 '수정' 진입
  function startLocalEdit() {
    editSnapshotRef.current = JSON.stringify(visits);
    setLocalEdit(true);
  }

  // 편집 '완료': 변경 없으면 그냥 종료, 있으면 확인 팝업
  function handleEditDone() {
    if (JSON.stringify(visits) === editSnapshotRef.current) {
      setLocalEdit(false);
      return;
    }
    setConfirmSave(true);
  }

  // 편집 '취소': 스냅샷으로 복원 후 종료
  function cancelEdits() {
    try {
      setVisits(normalizeVisits(JSON.parse(editSnapshotRef.current)));
    } catch {
      // 무시
    }
    setLocalEdit(false);
  }

  // 확인 팝업 → 반영
  async function saveEdits() {
    const ok = await putCard("completed");
    if (!ok) return;
    setConfirmSave(false);
    setLocalEdit(false);
    showToast("수정사항이 반영되었습니다.");
  }

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
  const phoneRaw = patient
    ? firstStr(patient.phone, subsidy.patient_mobile_phone, poa.delegator_phone, cms.account_holder_phone)
    : "";
  const phone = phoneRaw ? formatPhone(phoneRaw) : "";

  // 스텝바이스텝: 날짜가 비어있는 첫 행이 "현재 입력 행". 그 다음 행은 잠금.
  const activeIndex = (() => {
    const idx = visits.findIndex((v) => !v.date);
    return idx === -1 ? VISIT_COUNT : idx;
  })();

  // 블록 표시 규칙
  //  - 작성중(blue): 아직 안 채운 빈 칸에 파란 블록 (탭으로 O 껐다 켜면 다시 파란 블록)
  //  - 수정(green): 이미 입력한 칸에 초록 블록
  const cellCls = (filled: boolean, rowEditable: boolean, extra = "") => {
    let c = "cc-vr";
    if (rowEditable) c += " cc-edit";
    if (rowEditable && mode === "green" && filled) c += " cc-edit--green";
    else if (rowEditable && mode === "blue" && !filled) c += " cc-edit--empty";
    if (extra) c += " " + extra;
    return c;
  };

  function openProvider(i: number) {
    setProviderDraft(visits[i].provider);
    setProviderRow(i);
  }
  function saveProvider() {
    if (providerRow == null) return;
    update(providerRow, { provider: providerDraft });
    setProviderRow(null);
  }

  return (
    <div className="doc-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="doc-page__back" onClick={() => router.push(backHref)}>
          ← 목록으로
        </button>
        <div className="doc-page__toolbar-right">
          <button type="button" className="doc-page__edit" onClick={startLocalEdit}>
            수정
          </button>
          <button type="button" onClick={() => window.print()}>
            인쇄 (A4)
          </button>
        </div>
      </div>

      {error && <div className="error-banner no-print">{error}</div>}
      {toast && <div className="toast no-print">{toast}</div>}

      <CareCardZoom>
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

            {/* ④ 방문점검 서비스 기록 (편집 가능) */}
            <div className="cc-sec">④ 방문점검 서비스 기록</div>
            <table className="cc-table cc-visit">
              <colgroup>
                <col className="ccw-date" />
                <col className="ccw-insp" />
                <col className="ccw-insp" />
                <col className="ccw-insp" />
                <col className="ccw-insp" />
                <col className="ccw-insp" />
                <col className="ccw-usage" />
                <col className="ccw-action" />
                <col className="ccw-sign" />
                <col className="ccw-sign" />
              </colgroup>
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
                {visits.map((v, i) => {
                  const rowEditable = editing && i <= activeIndex;
                  const toggle = (key: keyof Visit) => {
                    if (rowEditable) update(i, { [key]: !v[key] } as Partial<Visit>);
                  };
                  return (
                    <tr key={i}>
                      <td className={cellCls(!!v.date, rowEditable, "cc-vr--date cc-date-cell")}>
                        <span className="cc-vr__val">{v.date ? fmtVisitDate(v.date) : ""}</span>
                        {rowEditable && (
                          <input
                            type="date"
                            className="cc-date-input"
                            value={v.date}
                            onChange={(e) => update(i, { date: e.target.value })}
                            aria-label="방문 날짜"
                          />
                        )}
                      </td>
                      <td className={cellCls(v.cpap, rowEditable)} onClick={() => toggle("cpap")}>
                        {v.cpap ? <span className="cc-o">O</span> : ""}
                      </td>
                      <td className={cellCls(v.supply, rowEditable)} onClick={() => toggle("supply")}>
                        {v.supply ? <span className="cc-o">O</span> : ""}
                      </td>
                      <td className={cellCls(v.hygiene, rowEditable)} onClick={() => toggle("hygiene")}>
                        {v.hygiene ? <span className="cc-o">O</span> : ""}
                      </td>
                      <td className={cellCls(v.alarm, rowEditable)} onClick={() => toggle("alarm")}>
                        {v.alarm ? <span className="cc-o">O</span> : ""}
                      </td>
                      <td className={cellCls(v.pressure, rowEditable)} onClick={() => toggle("pressure")}>
                        {v.pressure ? <span className="cc-o">O</span> : ""}
                      </td>
                      <td className={cellCls(!!v.usage, rowEditable, "cc-usage-cell")}>
                        <span className="cc-vr__val">{v.usage ? `${v.usage}시간` : ""}</span>
                        {rowEditable && (
                          <select
                            className="cc-usage-select"
                            value={v.usage}
                            onChange={(e) => update(i, { usage: e.target.value })}
                            aria-label="사용시간 선택"
                          >
                            <option value=""></option>
                            {Array.from({ length: 12 }, (_, n) => n + 1).map((h) => (
                              <option key={h} value={String(h)}>
                                {h}시간
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      {/* 조치사항: 탭 → 입력 팝업(최대 150자), 셀은 2줄 말줄임 */}
                      <td
                        className={cellCls(!!v.action, rowEditable, "cc-action-cell")}
                        onClick={() => rowEditable && setActionRow(i)}
                      >
                        <span className="cc-vr__clamp">{v.action}</span>
                      </td>
                      {/* 준요양기관: 탭 → 한혜리/백영신 선택 */}
                      <td
                        className={cellCls(!!v.provider, rowEditable)}
                        onClick={() => rowEditable && openProvider(i)}
                      >
                        <span className="cc-vr__val">{v.provider}</span>
                      </td>
                      {/* 환자(가족): 탭 → 서명 팝업 */}
                      <td
                        className={cellCls(!!v.guardianSign, rowEditable)}
                        onClick={() => rowEditable && setSignRow(i)}
                      >
                        {v.guardianSign ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.guardianSign} alt="환자(가족) 서명" className="cc-vr__sign" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
      </CareCardZoom>

      {/* 하단 액션 바 — 다른 서류와 동일 */}
      {localEdit ? (
        <div className="action-bar no-print">
          <button type="button" onClick={cancelEdits} disabled={saving}>
            취소
          </button>
          <button type="button" className="primary" onClick={handleEditDone} disabled={saving}>
            완료
          </button>
        </div>
      ) : !isCompleted ? (
        <div className="action-bar no-print">
          <button type="button" onClick={() => handleSubmit("draft")} disabled={saving}>
            임시저장
          </button>
          <button type="button" className="primary" onClick={() => handleSubmit("completed")} disabled={saving}>
            {saving ? "저장 중..." : "작성 완료"}
          </button>
        </div>
      ) : null}

      {/* 수정 완료 확인 팝업 */}
      {confirmSave && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => !saving && setConfirmSave(false)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">수정사항 반영</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 14, margin: "-4px 0 16px" }}>
              수정사항을 반영하시겠습니까?
            </p>
            <div className="field-popup__actions">
              <button type="button" onClick={() => setConfirmSave(false)} disabled={saving}>
                취소
              </button>
              <button type="button" className="primary" onClick={saveEdits} disabled={saving}>
                {saving ? "반영 중..." : "반영하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 조치사항 입력 팝업 (자체 상태로 분리 → 타이핑 시 표 전체 리렌더 방지) */}
      {actionRow != null && (
        <ActionEditor
          initial={visits[actionRow].action}
          onCancel={() => setActionRow(null)}
          onConfirm={(text) => {
            if (actionRow != null) update(actionRow, { action: text.slice(0, ACTION_MAX) });
            setActionRow(null);
          }}
        />
      )}

      {/* 준요양기관 점검자 선택 팝업 */}
      {providerRow != null && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => setProviderRow(null)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">준요양기관 점검자</div>
            <div className="cc-provider-list">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`cc-provider-item${providerDraft === p ? " is-on" : ""}`}
                  onClick={() => setProviderDraft(p)}
                >
                  <span className="cc-provider-check" aria-hidden>
                    {providerDraft === p ? "✓" : ""}
                  </span>
                  {p}
                </button>
              ))}
            </div>
            <div className="field-popup__actions">
              <button type="button" onClick={() => setProviderRow(null)}>
                취소
              </button>
              <button type="button" className="primary" onClick={saveProvider} disabled={!providerDraft}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 환자(가족) 서명 팝업 (계약서와 동일) */}
      {signRow != null && (
        <div className="sheet-overlay" onClick={() => setSignRow(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <SignaturePad
              label="환자(가족) 서명"
              confirmLabel="서명 확정"
              existingUrl={visits[signRow].guardianSign || undefined}
              onSave={(dataUrl) => {
                update(signRow, { guardianSign: dataUrl });
                setSignRow(null);
              }}
            />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setSignRow(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 조치사항 입력 팝업 — 자체 로컬 상태로 타이핑을 처리(부모 표 리렌더 방지)
function ActionEditor({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="sheet-overlay" onClick={onCancel}>
      <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
        <div className="field-popup__label">조치사항 (소독 및 소모품 교체 등)</div>
        <textarea
          className="cc-action-input"
          value={text}
          maxLength={ACTION_MAX}
          rows={5}
          autoFocus
          placeholder="조치 내용을 입력하세요 (최대 150자)"
          onChange={(e) => setText(e.target.value.slice(0, ACTION_MAX))}
        />
        <div className="cc-action-count">
          {text.length} / {ACTION_MAX}
        </div>
        <div className="field-popup__actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary" onClick={() => onConfirm(text)}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
