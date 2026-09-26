"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
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
const PRODUCTS = ["Prisma Smart", "Smart Max"];
const PROVIDER_ORGS = ["엔큐에스", "엠와이메디칼"];
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
  if (d.length === 8) d = "010" + d; // 서류엔 앞자리(010-) 제외 8자리로 저장됨
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw.trim();
}

// YYYY-MM-DD → YY.MM.DD
function fmtVisitDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

// ────────────────────────────────────────────────────────────
// 카드 본문(무거운 표) — 팝업 상태와 무관하므로 memo 처리:
// 팝업을 열 때(providerRow/actionRow/signRow 변경) 표가 다시 그려지지 않아 팝업이 즉시 뜬다.
// ────────────────────────────────────────────────────────────
interface BodyProps {
  visits: Visit[];
  editing: boolean;
  mode: "green" | "blue" | null;
  activeIndex: number;
  name: string;
  birth: string;
  phone: string;
  deviceId: string;
  contractPeriod: string;
  product: string;
  providerOrg: string;
  onOpenProduct: () => void;
  onOpenProviderOrg: () => void;
  onUpdate: (i: number, patch: Partial<Visit>) => void;
  onOpenAction: (i: number) => void;
  onOpenProvider: (i: number) => void;
  onOpenSign: (i: number) => void;
  guardianSrc: (i: number, val: string) => string;
}

const CareCardBody = memo(function CareCardBody({
  visits,
  editing,
  mode,
  activeIndex,
  name,
  birth,
  phone,
  deviceId,
  contractPeriod,
  product,
  providerOrg,
  onOpenProduct,
  onOpenProviderOrg,
  onUpdate,
  onOpenAction,
  onOpenProvider,
  onOpenSign,
  guardianSrc,
}: BodyProps) {
  // 블록 표시:
  //  - 수정(green): 이미 입력한 칸=초록, 아직 안 채운 편집 가능 칸=파란(다음 입력 유도)
  //  - 작성중(blue): 아직 안 채운 편집 가능 칸=파란
  const cellCls = (filled: boolean, rowEditable: boolean, extra = "") => {
    let c = "cc-vr";
    if (rowEditable) c += " cc-edit";
    if (rowEditable && mode === "green" && filled) c += " cc-edit--green";
    else if (rowEditable && !filled) c += " cc-edit--empty";
    if (extra) c += " " + extra;
    return c;
  };

  // 기본정보 표 편집 셀(제품명·상호명) 블록 클래스
  const basicEditCls = (filled: boolean) => {
    let c = "cc-val cc-basic-edit";
    if (editing && mode === "green" && filled) c += " cc-edit--green";
    else if (editing && !filled) c += " cc-edit--empty";
    return c;
  };

  return (
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
                <td className={basicEditCls(!!providerOrg)} onClick={() => editing && onOpenProviderOrg()}>
                  {providerOrg}
                </td>
                <td className="cc-lbl">연락처</td>
                <td className="cc-val" />
                <td className="cc-lbl">콜센터 번호</td>
                <td className="cc-val">{CALL_CENTER}</td>
              </tr>
              <tr>
                <th className="cc-cat">기기정보</th>
                <td className="cc-lbl">기기 관리번호</td>
                <td className="cc-val">{deviceId}</td>
                <td className="cc-lbl">제품명</td>
                <td className={basicEditCls(!!product)} onClick={() => editing && onOpenProduct()}>
                  {product}
                </td>
                <td className="cc-lbl">계약기간</td>
                <td className="cc-val">{contractPeriod}</td>
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
                <td className="cc-check cc-check--wide">[O] 장비기능 &nbsp; [O] 알람기능 &nbsp; [O] 소독·세척</td>
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
                <td className="cc-check cc-check--wide">[O] 장비사용법 &nbsp; [O] 응급상황 시 대처요령 &nbsp; [O] 기타</td>
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
                  if (rowEditable) onUpdate(i, { [key]: !v[key] } as Partial<Visit>);
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
                          onChange={(e) => onUpdate(i, { date: e.target.value })}
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
                          onChange={(e) => onUpdate(i, { usage: e.target.value })}
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
                      onClick={() => rowEditable && onOpenAction(i)}
                    >
                      <span className="cc-vr__clamp">{v.action}</span>
                    </td>
                    {/* 준요양기관: 탭 → 한혜리/백영신 선택 */}
                    <td
                      className={cellCls(!!v.provider, rowEditable)}
                      onClick={() => rowEditable && onOpenProvider(i)}
                    >
                      <span className="cc-vr__val">{v.provider}</span>
                    </td>
                    {/* 환자(가족): 탭 → 서명 팝업 */}
                    {(() => {
                      const gsrc = guardianSrc(i, v.guardianSign);
                      return (
                        <td
                          className={cellCls(!!gsrc, rowEditable)}
                          onClick={() => rowEditable && onOpenSign(i)}
                        >
                          {gsrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={gsrc} alt="환자(가족) 서명" className="cc-vr__sign" />
                          ) : null}
                        </td>
                      );
                    })()}
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
  );
});

// 양압기 환자관리카드 (별지 제5호 서식) — 다른 서류와 동일한 작성/수정 흐름.
export default function CareCardForm({ patientId, backHref }: CareCardFormProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientWithDocuments | null>(null);
  const [visits, setVisits] = useState<Visit[]>(() => Array.from({ length: VISIT_COUNT }, blankVisit));
  const [status, setStatus] = useState<"draft" | "completed">("draft");
  const [localEdit, setLocalEdit] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const editSnapshotRef = useRef<string>("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 기기정보 제품명(편집): Prisma Smart / Smart Max 중 선택
  const [product, setProduct] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  // 준요양기관 상호명(편집): 엔큐에스 / 엠와이메디칼 중 선택
  const [providerOrg, setProviderOrg] = useState("");
  const [providerOrgOpen, setProviderOrgOpen] = useState(false);

  // 편집 팝업들 (본문과 분리되어 열림 → 표 리렌더 없음)
  const [actionRow, setActionRow] = useState<number | null>(null);
  const [providerRow, setProviderRow] = useState<number | null>(null);
  const [signRow, setSignRow] = useState<number | null>(null);

  // 서명 이미지: 스토리지 경로 → 서명 URL (서버) / 방금 그린 서명 dataURL (로컬 즉시표시)
  const [signUrls, setSignUrls] = useState<Record<string, string>>({});
  const [localSigns, setLocalSigns] = useState<Record<number, string>>({});

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
            const cfd = cc.form_data as Record<string, unknown>;
            if (cfd?.visits) setVisits(normalizeVisits(cfd.visits));
            if (typeof cfd?.product === "string") setProduct(cfd.product);
            if (typeof cfd?.providerOrg === "string") setProviderOrg(cfd.providerOrg);
          }
          if (p.signedUrls) setSignUrls(p.signedUrls);
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
  const editing = !isCompleted || localEdit;
  const mode: "green" | "blue" | null = localEdit ? "green" : !isCompleted ? "blue" : null;

  // 안정적 콜백(참조 고정) — 본문 memo가 팝업 상태 변경 시 리렌더되지 않도록
  const update = useCallback((i: number, patch: Partial<Visit>) => {
    setVisits((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }, []);
  const openAction = useCallback((i: number) => setActionRow(i), []);
  const openProvider = useCallback((i: number) => setProviderRow(i), []);
  const openSign = useCallback((i: number) => setSignRow(i), []);

  // 서명 저장: 즉시 로컬 표시 후 스토리지 업로드(경로 저장). 실패 시 base64로 폴백.
  const saveGuardianSign = useCallback(
    (i: number, dataUrl: string) => {
      setLocalSigns((prev) => ({ ...prev, [i]: dataUrl }));
      setSignRow(null);
      fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          docType: "care_card",
          kind: "signature",
          fieldKey: `guardian-${i}`,
          dataUrl,
        }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("upload failed"))))
        .then((json) => {
          if (typeof json?.path === "string") {
            update(i, { guardianSign: json.path });
            setSignUrls((prev) => ({ ...prev, [json.path]: dataUrl }));
          } else {
            update(i, { guardianSign: dataUrl });
          }
        })
        .catch(() => {
          update(i, { guardianSign: dataUrl }); // 업로드 실패 → base64 폴백(데이터 유실 방지)
        });
    },
    [patientId, update]
  );

  // 서명 이미지 표시용 URL 해석: 방금 그린 것 → 서버 서명 URL → data URL(레거시/폴백)
  const guardianSrc = useCallback(
    (i: number, val: string): string => {
      if (localSigns[i]) return localSigns[i];
      if (!val) return "";
      if (val.startsWith("data:")) return val;
      return signUrls[val] ?? "";
    },
    [localSigns, signUrls]
  );

  async function putCard(targetStatus: "draft" | "completed"): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${patientId}/care_card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: { visits, product, providerOrg }, status: targetStatus }),
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

  function startLocalEdit() {
    editSnapshotRef.current = JSON.stringify({ visits, product, providerOrg });
    setLocalEdit(true);
  }

  function handleEditDone() {
    if (JSON.stringify({ visits, product, providerOrg }) === editSnapshotRef.current) {
      setLocalEdit(false);
      return;
    }
    setConfirmSave(true);
  }

  function cancelEdits() {
    try {
      const snap = JSON.parse(editSnapshotRef.current) as {
        visits?: unknown;
        product?: unknown;
        providerOrg?: unknown;
      };
      setVisits(normalizeVisits(snap.visits));
      if (typeof snap.product === "string") setProduct(snap.product);
      if (typeof snap.providerOrg === "string") setProviderOrg(snap.providerOrg);
    } catch {
      // 무시
    }
    setLocalEdit(false);
  }

  async function saveEdits() {
    const ok = await putCard("completed");
    if (!ok) return;
    setConfirmSave(false);
    setLocalEdit(false);
    showToast("수정사항이 반영되었습니다.");
  }

  // 사용자가 실제로 입력한 게 하나라도 있는지 (방문점검·제품명·상호명)
  function hasUserInput(): boolean {
    if (product || providerOrg) return true;
    return visits.some(
      (v) =>
        v.date || v.cpap || v.supply || v.hygiene || v.alarm || v.pressure || v.usage || v.action || v.provider || v.guardianSign
    );
  }

  // 상단 '목록으로': 작성 중이고 입력이 있을 때만 임시저장 후 토스트 보여주고 이동
  async function handleBack() {
    if (!isCompleted && hasUserInput()) {
      const ok = await putCard("draft");
      if (ok) {
        try {
          window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
        } catch {
          // 무시
        }
        showToast("임시저장 되었습니다.");
        setTimeout(() => router.push(backHref), 650);
        return;
      }
    }
    router.push(backHref);
  }

  const docs = patient?.documents ?? [];
  const subsidy = fd(docs, "subsidy_application");
  const poa = fd(docs, "power_of_attorney");
  const cms = fd(docs, "cms_autopay");
  const contract = fd(docs, "contract");

  // 기기정보 자동 채움(계약서에서)
  const deviceId = typeof contract.device_id === "string" ? contract.device_id : "";
  const contractPeriod = (() => {
    const y = parseInt(String(contract.rental_start_year ?? ""), 10);
    const m = parseInt(String(contract.rental_start_month ?? ""), 10);
    const d = parseInt(String(contract.rental_start_day ?? ""), 10);
    if (!y || !m || !d) return "";
    const pad = (v: number) => String(v).padStart(2, "0");
    const start = `${y}.${pad(m)}.${pad(d)}`;
    return `${start} ~ 계약 종료 시까지`; // 계약서 문구 그대로
  })();

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

  const activeIndex = (() => {
    const idx = visits.findIndex((v) => !v.date);
    return idx === -1 ? VISIT_COUNT : idx;
  })();

  return (
    <div className="doc-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="doc-page__back" onClick={handleBack}>
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

      <CareCardBody
        visits={visits}
        editing={editing}
        mode={mode}
        activeIndex={activeIndex}
        name={name}
        birth={birth}
        phone={phone}
        deviceId={deviceId}
        contractPeriod={contractPeriod}
        product={product}
        providerOrg={providerOrg}
        onOpenProduct={() => setProductOpen(true)}
        onOpenProviderOrg={() => setProviderOrgOpen(true)}
        onUpdate={update}
        onOpenAction={openAction}
        onOpenProvider={openProvider}
        onOpenSign={openSign}
        guardianSrc={guardianSrc}
      />

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

      {/* 조치사항 입력 팝업 */}
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

      {/* 제품명 선택 팝업 (Prisma Smart / Smart Max) */}
      {productOpen && (
        <ProductEditor
          initial={product}
          onCancel={() => setProductOpen(false)}
          onConfirm={(p) => {
            setProduct(p);
            setProductOpen(false);
          }}
        />
      )}

      {/* 준요양기관 상호명 선택 팝업 (엔큐에스 / 엠와이메디칼) */}
      {providerOrgOpen && (
        <ProductEditor
          title="준요양기관 상호명"
          options={PROVIDER_ORGS}
          initial={providerOrg}
          onCancel={() => setProviderOrgOpen(false)}
          onConfirm={(v) => {
            setProviderOrg(v);
            setProviderOrgOpen(false);
          }}
        />
      )}

      {/* 준요양기관 점검자 선택 팝업 */}
      {providerRow != null && (
        <ProviderEditor
          initial={visits[providerRow].provider}
          onCancel={() => setProviderRow(null)}
          onConfirm={(p) => {
            if (providerRow != null) update(providerRow, { provider: p });
            setProviderRow(null);
          }}
        />
      )}

      {/* 환자(가족) 서명 팝업 (계약서와 동일) */}
      {signRow != null && (
        <div className="sheet-overlay" onClick={() => setSignRow(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <SignaturePad
              label="환자(가족) 서명"
              confirmLabel="서명 확정"
              existingUrl={guardianSrc(signRow, visits[signRow].guardianSign) || undefined}
              onSave={(dataUrl) => saveGuardianSign(signRow, dataUrl)}
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

// 준요양기관 점검자 선택 팝업
function ProviderEditor({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (p: string) => void;
}) {
  const [pick, setPick] = useState(initial);
  return (
    <div className="sheet-overlay sheet-overlay--center" onClick={onCancel}>
      <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title sheet__title--name">준요양기관 점검자</div>
        <div className="cc-provider-list">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              className={`cc-provider-item${pick === p ? " is-on" : ""}`}
              onClick={() => setPick(p)}
            >
              <span className="cc-provider-check" aria-hidden>
                {pick === p ? "✓" : ""}
              </span>
              {p}
            </button>
          ))}
        </div>
        <div className="field-popup__actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary" onClick={() => onConfirm(pick)} disabled={!pick}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// 단일 선택 팝업(체크박스형) — 제품명/상호명 등에 재사용
function ProductEditor({
  initial,
  onCancel,
  onConfirm,
  title = "제품명 선택",
  options = PRODUCTS,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (p: string) => void;
  title?: string;
  options?: string[];
}) {
  const [pick, setPick] = useState(initial);
  return (
    <div className="sheet-overlay sheet-overlay--center" onClick={onCancel}>
      <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title sheet__title--name">{title}</div>
        <div className="cc-provider-list">
          {options.map((p) => (
            <button
              key={p}
              type="button"
              className={`cc-provider-item${pick === p ? " is-on" : ""}`}
              onClick={() => setPick(p)}
            >
              <span className="cc-provider-check" aria-hidden>
                {pick === p ? "✓" : ""}
              </span>
              {p}
            </button>
          ))}
        </div>
        <div className="field-popup__actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary" onClick={() => onConfirm(pick)} disabled={!pick}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
