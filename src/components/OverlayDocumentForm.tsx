"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OverlayDoc, OverlayField } from "@/lib/overlays/types";
import ZoomableDocument from "./ZoomableDocument";
import SignaturePad from "./SignaturePad";
import { PATIENTS_CHANGED_EVENT } from "./BottomTabs";

interface OverlayDocumentFormProps {
  overlay: OverlayDoc;
  docType: string;
  patientId: string;
  initialFormData: Record<string, unknown>;
  initialSignedUrls: Record<string, string>;
  initialStatus: "draft" | "completed";
  backHref: string;
  preview?: boolean;
  /** PDF 묶음 뷰어 등에 자체 chrome 없이 문서만 임베드 */
  embedded?: boolean;
  /** 편집 모드: 편집 가능한 칸을 초록 반투명으로 표시 */
  editMode?: boolean;
}

export interface OverlayDocumentFormHandle {
  save: () => Promise<boolean>;
}

function formatBoxPattern(raw: string, pattern: number[]): string {
  const total = pattern.reduce((a, b) => a + b, 0);
  const digits = raw.replace(/\D/g, "").slice(0, total);
  let out = "";
  let i = 0;
  for (let s = 0; s < pattern.length; s++) {
    const seg = digits.slice(i, i + pattern[s]);
    out += seg;
    i += pattern[s];
    if (seg.length === pattern[s] && s < pattern.length - 1) out += "-";
    if (seg.length < pattern[s]) break;
  }
  return out;
}

// soft 하이픈: 패턴대로 '-'를 넣되 자릿수를 강제하지 않음(초과 숫자도 잘리지 않고 뒤에 붙음).
// 은행 계좌처럼 대부분은 표준 형식이지만 예외 계좌가 있을 수 있는 경우에 사용.
function formatSoftPattern(raw: string, pattern: number[]): string {
  const digits = raw.replace(/\D/g, "");
  let out = "";
  let i = 0;
  for (const seg of pattern) {
    const part = digits.slice(i, i + seg);
    if (!part) return out;
    out += (out ? "-" : "") + part;
    i += seg;
  }
  if (i < digits.length) out += "-" + digits.slice(i); // 표준보다 긴 예외 계좌: 남는 숫자도 보존
  return out;
}

function OverlayDocumentFormInner(
  {
    overlay,
    docType,
    patientId,
    initialFormData,
    initialSignedUrls,
    initialStatus,
    backHref,
    preview = false,
    embedded = false,
    editMode = false,
  }: OverlayDocumentFormProps,
  ref: React.ForwardedRef<OverlayDocumentFormHandle>
) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({ ...initialFormData });
  const [sigUrls, setSigUrls] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const f of overlay.fields) {
      if (f.type !== "signature") continue;
      const path = initialFormData[f.key];
      if (typeof path === "string" && initialSignedUrls[path]) map[f.key] = initialSignedUrls[path];
    }
    return map;
  });
  const [openField, setOpenField] = useState<OverlayField | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localEdit, setLocalEdit] = useState(false); // 완료 서류 화면에서 '수정' 눌렀을 때
  const [confirmSave, setConfirmSave] = useState(false);
  const [pdfPromptOpen, setPdfPromptOpen] = useState(false); // 저장 후 PDF도 업데이트할지
  // 주소 검색(도로명/지번)
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrStage, setAddrStage] = useState<"search" | "detail">("search");
  const [addrBase, setAddrBase] = useState("");
  const [addrDetail, setAddrDetail] = useState("");
  const addrFieldRef = useRef<string | null>(null);
  const postcodeBoxRef = useRef<HTMLDivElement | null>(null);
  const editSnapshotRef = useRef<string>(""); // 수정 진입 시 값 스냅샷(변경 여부 판단)
  const popupRef = useRef<HTMLDivElement | null>(null);

  const isCompleted = initialStatus === "completed";
  const highlightEdit = editMode || localEdit; // 편집 가능 칸 초록 표시
  const [dateGroupOpen, setDateGroupOpen] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState("");

  const fieldByKey = useMemo(() => {
    const m = new Map<string, OverlayField>();
    for (const f of overlay.fields) m.set(f.key, f);
    return m;
  }, [overlay.fields]);

  // 텍스트 팝업이 열리면 모바일 키보드 위로 올라오도록 하단 여백 조정
  useEffect(() => {
    if (!openField || openField.type !== "text") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (popupRef.current) popupRef.current.style.paddingBottom = `${kb}px`;
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [openField]);

  const aspectRatio = overlay.width / overlay.height;

  // 임베드(뷰어) 편집 저장 핸들: 현재 값을 완료 상태로 저장
  useImperativeHandle(
    ref,
    () => ({
      async save() {
        if (preview) return true;
        try {
          const res = await fetch(`/api/documents/${patientId}/${docType}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ form_data: values, status: "completed" }),
          });
          return res.ok;
        } catch {
          return false;
        }
      },
    }),
    [values, patientId, docType, preview]
  );

  // 고정 체크(항상 동의) + 오늘 날짜 자동 입력 초기화
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of overlay.fields) {
        if (f.type === "checkbox" && f.fixedChecked && next[f.key] !== true) {
          next[f.key] = true;
          changed = true;
        }
      }
      // 그룹의 y/m/d 값에서 Date 재구성
      const readGroupDate = (g: string): Date | null => {
        const parts = overlay.fields.filter((f) => f.dateGroup === g);
        let y = "";
        let m = "";
        let d = "";
        for (const f of parts) {
          const v = next[f.key];
          if (typeof v !== "string" || !v.trim()) continue;
          if (f.datePart === "y") y = f.fullYear ? v : "20" + v.padStart(2, "0");
          else if (f.datePart === "m") m = v;
          else if (f.datePart === "d") d = v;
          else if (f.datePart === "full") {
            const mm = /(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(v);
            if (mm) {
              y = mm[1];
              m = mm[2];
              d = mm[3];
            }
          }
        }
        if (!y || !m || !d) {
          const iso = next[`__d_${g}`];
          if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            [y, m, d] = iso.split("-");
          }
        }
        if (!y || !m || !d) return null;
        return new Date(Number(y), Number(m) - 1, Number(d));
      };

      const setGroupFromDate = (parts: OverlayField[], g: string, dt: Date) => {
        const y = String(dt.getFullYear());
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        next[`__d_${g}`] = `${y}-${m}-${d}`;
        for (const f of parts) {
          const nv =
            f.datePart === "y"
              ? f.fullYear
                ? y
                : y.slice(2)
              : f.datePart === "m"
                ? String(Number(m))
                : f.datePart === "d"
                  ? String(Number(d))
                  : f.datePart === "full"
                    ? `${y}.${m}.${d}`
                    : null;
          if (nv != null && next[f.key] !== nv) {
            next[f.key] = nv;
            changed = true;
          }
        }
      };

      const groups = new Set<string>();
      for (const f of overlay.fields) if (f.autoToday && f.dateGroup) groups.add(f.dateGroup);
      // baseGroup 파생 그룹은 기준 그룹 처리 후 계산되도록 뒤로
      const sortedGroups = [...groups].sort((a, b) => {
        const aBase = overlay.fields.some((f) => f.dateGroup === a && f.baseGroup);
        const bBase = overlay.fields.some((f) => f.dateGroup === b && f.baseGroup);
        return aBase === bBase ? 0 : aBase ? 1 : -1;
      });
      for (const g of sortedGroups) {
        const parts = overlay.fields.filter((f) => f.dateGroup === g);
        const offY = parts.find((f) => f.autoTodayOffsetYears != null)?.autoTodayOffsetYears ?? 0;
        const offD = parts.find((f) => f.autoTodayOffsetDays != null)?.autoTodayOffsetDays ?? 0;
        const baseG = parts.find((f) => f.baseGroup)?.baseGroup;

        if (baseG) {
          // 기준 그룹 날짜 + 오프셋으로 항상 재계산(이미 저장된 문서도 보정)
          const bd = readGroupDate(baseG);
          if (!bd) continue;
          bd.setFullYear(bd.getFullYear() + offY);
          if (offD) bd.setDate(bd.getDate() + offD);
          setGroupFromDate(parts, g, bd);
          continue;
        }

        const anyFilled = parts.some((f) => typeof next[f.key] === "string" && (next[f.key] as string).trim());
        if (anyFilled) continue;
        const dt = new Date();
        dt.setFullYear(dt.getFullYear() + offY);
        if (offD) dt.setDate(dt.getDate() + offD);
        setGroupFromDate(parts, g, dt);
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 주소 검색(다음 우편번호) 위젯 로드 + 임베드
  useEffect(() => {
    if (!addrOpen || addrStage !== "search") return;
    let cancelled = false;
    const win = window as unknown as {
      daum?: { Postcode: new (o: object) => { embed: (el: HTMLElement) => void } };
    };
    const embed = () => {
      if (cancelled || !postcodeBoxRef.current || !win.daum?.Postcode) return;
      postcodeBoxRef.current.innerHTML = "";
      new win.daum.Postcode({
        oncomplete: (data: { roadAddress?: string; jibunAddress?: string; address?: string }) => {
          setAddrBase(data.roadAddress || data.jibunAddress || data.address || "");
          setAddrStage("detail");
        },
        width: "100%",
        height: "100%",
      }).embed(postcodeBoxRef.current);
    };
    if (win.daum?.Postcode) {
      embed();
    } else {
      const existing = document.getElementById("daum-postcode-script") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", embed);
      } else {
        const s = document.createElement("script");
        s.id = "daum-postcode-script";
        s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
        s.onload = embed;
        document.body.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [addrOpen, addrStage]);

  function confirmAddr() {
    const key = addrFieldRef.current;
    if (!key) return;
    const full = addrDetail.trim() ? `${addrBase} ${addrDetail.trim()}` : addrBase;
    setValues((prev) => ({ ...prev, [key]: full }));
    setAddrOpen(false);
  }

  function handleTapField(key: string) {
    const field = fieldByKey.get(key);
    if (!field) return;
    // 완료된 서류는 '수정' 모드에서만 편집 가능(보기 모드에선 탭 무시)
    if (!embedded && isCompleted && !localEdit) return;
    // 고정 체크·오늘날짜 자동·도장 필드는 편집 불가
    if (field.fixedChecked || field.autoToday || field.stampImage) return;
    // 조건부 편집: 지정 체크박스가 선택되지 않았으면 편집 불가(예: 은행계좌 선택 시 카드 유효기간)
    if (field.editableIf && values[field.editableIf] !== true) return;

    // 주소 검색(도로명/지번) 필드
    if (field.addressSearch) {
      addrFieldRef.current = key;
      setAddrBase("");
      setAddrDetail("");
      setAddrStage("search");
      setAddrOpen(true);
      return;
    }

    if (field.type === "checkbox") {
      setValues((prev) => {
        const next = { ...prev };
        const currently = Boolean(prev[key]);
        // radio-group: clear siblings
        if (field.group) {
          for (const f of overlay.fields) {
            if (f.type === "checkbox" && f.group === field.group) next[f.key] = false;
          }
          // 결제수단(은행/카드) 변경 시: 결제수단에 따라 목록/형식이 바뀌는 필드는 초기화
          const inSameGroup = (cb: string) =>
            overlay.fields.find((x) => x.key === cb)?.group === field.group;
          for (const f of overlay.fields) {
            const cond = f.optionsByCheckbox ?? f.dashPatternByCheckbox;
            if (cond && Object.keys(cond).some(inSameGroup)) next[f.key] = "";
            // 결제수단 전용 필드(카드 유효기간·결제자명 등)도 결제수단 변경 시 초기화
            if (f.editableIf && inSameGroup(f.editableIf)) next[f.key] = "";
          }
        }
        next[key] = !currently;
        return next;
      });
      return;
    }

    if (field.dateGroup) {
      // 팝업 인라인 캘린더: 기존 값이 있으면 그 날짜, 없으면 오늘을 기본 선택
      const cur = values[`__d_${field.dateGroup}`];
      const now = new Date();
      const p2 = (n: number) => String(n).padStart(2, "0");
      const todayIso = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
      setDateDraft(typeof cur === "string" && cur ? cur : todayIso);
      setDateGroupOpen(field.dateGroup);
      return;
    }

    if (field.type === "text") {
      setTextDraft(typeof values[key] === "string" ? (values[key] as string) : "");
    }
    setOpenField(field);
  }

  function applyDate(group: string, iso: string) {
    // iso: YYYY-MM-DD
    const [y, m, d] = iso.split("-");
    setValues((prev) => {
      const next = { ...prev, [`__d_${group}`]: iso };
      for (const f of overlay.fields) {
        if (f.dateGroup !== group) continue;
        if (f.datePart === "y") next[f.key] = y ? (f.fullYear ? y : y.slice(2)) : "";
        else if (f.datePart === "m") next[f.key] = m ? String(Number(m)) : "";
        else if (f.datePart === "d") next[f.key] = d ? String(Number(d)) : "";
        else if (f.datePart === "full") next[f.key] = y && m && d ? `${y}.${m}.${d}` : "";
      }
      return next;
    });
    setOpenField(null);
  }

  function commitText() {
    if (!openField) return;
    setValues((prev) => ({ ...prev, [openField.key]: textDraft }));
    setOpenField(null);
  }

  // 선택 필드의 현재 옵션 목록 계산(체크박스에 따라 달라질 수 있음)
  function resolveOptions(field: OverlayField): string[] | null {
    if (field.optionsByCheckbox) {
      for (const [cbKey, list] of Object.entries(field.optionsByCheckbox)) {
        if (values[cbKey] === true) return list;
      }
      return []; // 결제수단 미선택: 빈 목록 → 안내 문구 표시
    }
    return field.options ?? null;
  }

  function selectOption(field: OverlayField, opt: string) {
    setValues((prev) => ({ ...prev, [field.key]: opt }));
    setOpenField(null);
  }

  // 체크박스에 따라 달라지는 팝업 라벨(예: 계좌번호/카드번호)
  function effLabel(field: OverlayField): string | undefined {
    if (field.labelByCheckbox) {
      for (const [cb, lbl] of Object.entries(field.labelByCheckbox)) {
        if (values[cb] === true) return lbl;
      }
    }
    return field.label;
  }

  // 실제 적용할 자릿수 하이픈 패턴. hard=true면 자릿수 제한(카드), false면 soft(은행: 숫자 안 잘림). 없으면 자유 입력.
  function effDash(field: OverlayField): { pattern: number[]; hard: boolean } | undefined {
    if (field.dashPattern) return { pattern: field.dashPattern, hard: true };
    if (field.dashPatternByCheckbox) {
      for (const [cb, pat] of Object.entries(field.dashPatternByCheckbox)) {
        if (values[cb] === true) return { pattern: pat, hard: true };
      }
    }
    if (field.dashPatternByOptionOf) {
      const sel = values[field.dashPatternByOptionOf.field];
      if (typeof sel === "string") {
        const pat = field.dashPatternByOptionOf.map[sel];
        if (pat) return { pattern: pat, hard: false };
      }
    }
    return undefined;
  }

  async function handleSignatureSave(field: OverlayField, dataUrl: string) {
    if (preview) {
      setSigUrls((prev) => ({ ...prev, [field.key]: dataUrl }));
      setValues((prev) => ({ ...prev, [field.key]: "preview-signature" }));
      setOpenField(null);
      return;
    }
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        docType,
        kind: "signature",
        fieldKey: field.key,
        dataUrl,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "서명 저장 실패");
      return;
    }
    setValues((prev) => ({ ...prev, [field.key]: json.path }));
    setSigUrls((prev) => ({ ...prev, [field.key]: dataUrl }));
    setOpenField(null);
  }

  // 나갈 때: 완료 문서가 아니면 방문 기록을 draft로 저장한다.
  // 이번 세션에 초기값 대비 실제로 변경/입력된 것이 하나라도 있는지
  // (자동 오늘날짜·고정체크·가림·표시라벨·도장은 제외 — 사용자가 건드린 게 아님)
  function changedFromInitial(): boolean {
    const norm = (v: unknown): string => {
      if (v === undefined || v === null || v === "" || v === false) return "";
      if (typeof v === "string") return v.trim();
      if (typeof v === "boolean") return v ? "1" : "";
      return JSON.stringify(v);
    };
    return overlay.fields.some((f) => {
      if (f.autoToday || f.fixedChecked || f.cover || f.staticText || f.stampImage) return false;
      return norm(values[f.key]) !== norm(initialFormData[f.key]);
    });
  }

  async function handleBack() {
    // 이번 세션에 바뀐 게 없으면 저장·토스트 없이 그냥 이동
    if (!preview && initialStatus !== "completed" && changedFromInitial()) {
      try {
        await fetch(`/api/documents/${patientId}/${docType}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form_data: values, status: "draft" }),
        });
        try {
          window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
        } catch {
          // 무시
        }
        showToast("임시저장 되었습니다.");
        setTimeout(() => router.push(backHref), 650); // 토스트 잠깐 보여주고 이동
        return;
      } catch {
        // 저장 실패해도 이동은 진행
      }
    }
    router.push(backHref);
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  // '수정' 진입: 현재 값 스냅샷 저장 후 편집 모드 시작
  function startLocalEdit() {
    editSnapshotRef.current = JSON.stringify(values);
    setLocalEdit(true);
  }

  // '완료': 변경이 없으면 그냥 종료(취소와 동일), 변경이 있으면 반영 확인 팝업
  function handleEditDone() {
    if (JSON.stringify(values) === editSnapshotRef.current) {
      setLocalEdit(false);
      return;
    }
    setConfirmSave(true);
  }

  // '수정' 취소: 값·서명을 처음 상태로 되돌리고 편집 모드 종료
  function cancelEdits() {
    setValues({ ...initialFormData });
    const map: Record<string, string> = {};
    for (const f of overlay.fields) {
      if (f.type !== "signature") continue;
      const path = initialFormData[f.key];
      if (typeof path === "string" && initialSignedUrls[path]) map[f.key] = initialSignedUrls[path];
    }
    setSigUrls(map);
    setLocalEdit(false);
  }

  // '완료' 확인 팝업에서 반영: 완료 상태로 저장하고 편집 모드 종료(화면 유지)
  async function saveEdits() {
    if (!allFilled()) {
      setConfirmSave(false);
      showToast("빈 칸을 모두 채우세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${patientId}/${docType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: values, status: isCompleted ? "completed" : "draft" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "저장 실패");
        return;
      }
      setConfirmSave(false);
      setLocalEdit(false);
      // PDF는 '수정 저장' 시점이 아니라, 환자 상세의 'PDF로 출력' 버튼을 누를 때
      // 그 시점의 5개 문서 최신 상태로 생성한다. 여기선 저장만 하고 프롬프트 없음.
      showToast("저장되었습니다.");
    } finally {
      setSaving(false);
    }
  }

  // 편집 대상(텍스트·서명) 칸이 모두 채워졌는지
  function allFilled(): boolean {
    return overlay.fields.every((f) => {
      if (f.type === "checkbox") {
        // 필수 선택 그룹: 같은 group에서 하나라도 선택돼야 완료 가능
        if (f.requiredGroup && f.group) {
          return overlay.fields.some((g) => g.group === f.group && values[g.key] === true);
        }
        return true; // 그 외 체크박스는 필수 아님
      }
      if (f.cover || f.staticText || f.stampImage) return true; // 가림 박스·표시 라벨·도장은 입력 대상 아님
      if (f.optional) return true; // 선택 입력 항목(예: 자택 전화)
      if (f.requiredIf && values[f.requiredIf] !== true) return true; // 조건부 필수(예: 카드 선택 시에만)
      // 그룹 조건부 필수: 해당 group의 체크박스가 하나도 선택 안 됐으면 필수 아님
      if (f.requiredIfGroup && !overlay.fields.some((g) => g.group === f.requiredIfGroup && values[g.key] === true))
        return true;
      const v = values[f.key];
      return typeof v === "string" ? v.trim() !== "" : !!v;
    });
  }

  async function handleSubmit(targetStatus: "draft" | "completed") {
    // 작성 완료 시 빈 칸이 있으면 막고 토스트
    if (targetStatus === "completed" && !allFilled()) {
      showToast("빈 칸을 모두 채우세요.");
      return;
    }
    if (preview) {
      if (targetStatus === "completed") router.push(backHref);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${patientId}/${docType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: values, status: targetStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "저장 실패");
        return;
      }
      if (targetStatus === "completed") {
        try {
          window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
        } catch {
          // 무시
        }
        // 작성완료하면 환자목록으로 이동(서식 제출 흐름). 환자 상세에서 온 경우엔 해당 폴더로.
        router.push(backHref === "/submit" ? "/patients" : backHref);
      }
    } finally {
      setSaving(false);
    }
  }

  function renderFieldOverlay(field: OverlayField) {
    const value = values[field.key];
    const style: React.CSSProperties = {
      left: `${field.x}%`,
      top: `${field.y}%`,
      width: `${field.w}%`,
      height: `${field.h}%`,
    };

    // 인쇄 글자 가림 박스 (편집 불가·탭 불가)
    if (field.cover) {
      return <div key={field.key} className="odoc-hotspot odoc-hotspot--cover" style={style} aria-hidden />;
    }
    // 도장(직인) 이미지 (항상 표시·편집 불가·탭 불가). multiply로 뒤 글자 비침
    if (field.stampImage) {
      return (
        <div key={field.key} className="odoc-hotspot odoc-hotspot--stamp" style={style} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={field.stampImage} alt="" className="odoc-hotspot__stamp" draggable={false} />
        </div>
      );
    }
    // 고정 표시 텍스트 (편집 불가·탭 불가)
    if (field.staticText) {
      return (
        <div key={field.key} className="odoc-hotspot odoc-hotspot--static" style={style} aria-hidden>
          <span
            className="odoc-hotspot__text"
            style={{
              fontSize: `${field.fontPct ?? 1.4}cqw`,
              justifyContent:
                field.align === "left" ? "flex-start" : field.align === "right" ? "flex-end" : "center",
            }}
          >
            {field.staticText}
          </span>
        </div>
      );
    }

    let content: React.ReactNode = null;
    let filled = false;

    if (field.type === "signature") {
      const url = sigUrls[field.key];
      if (url) {
        filled = true;
        content = (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="서명"
            className="odoc-hotspot__sig"
            style={{
              objectPosition:
                field.align === "right" ? "right center" : field.align === "center" ? "center" : "left center",
            }}
          />
        );
      }
    } else if (field.type === "checkbox") {
      if (field.parenMark) {
        const selected = value === true;
        // 선택 전엔 파란 블록(입력 안내) 표시. 그룹에서 하나라도 선택되면 파란 블록 제거.
        filled = field.group
          ? overlay.fields.some((f) => f.group === field.group && values[f.key] === true)
          : selected;
        content = (
          <span
            className="odoc-hotspot__paren"
            style={{ fontSize: `${field.fontPct ?? 1.4}cqw` }}
          >
            {selected ? "( O )" : "(   )"}
          </span>
        );
      } else if (value || field.fixedChecked) {
        filled = true;
        content = (
          <svg
            className="odoc-hotspot__check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        );
      }
    } else if (field.boxPattern && field.boxPattern.length) {
      // 구간별 네모칸: 각 칸에 한 글자씩, 구간 사이는 대시 폭만큼 빈 칸
      const str = typeof value === "string" ? value : "";
      if (str.trim()) filled = true;
      const cells: React.ReactNode[] = [];
      let di = 0;
      field.boxPattern.forEach((seg, si) => {
        for (let j = 0; j < seg; j++) {
          const ch = str[di++] ?? "";
          cells.push(
            <span
              key={`d${si}-${j}`}
              className="odoc-hotspot__boxcell"
              style={{ flexGrow: 21, flexBasis: 0 }}
            >
              {ch}
            </span>
          );
        }
        if (si < field.boxPattern!.length - 1)
          cells.push(<span key={`g${si}`} style={{ flexGrow: 12, flexBasis: 0 }} />);
      });
      content = (
        <span className="odoc-hotspot__boxes" style={{ fontSize: `${(field.fontPct ?? 1.4) * 1.1}cqw` }}>
          {cells}
        </span>
      );
    } else if (effDash(field)) {
      // 전화번호·카드번호·계좌번호 등: 문서엔 접두어 + 하이픈 텍스트로 표시(네모칸 아님)
      const eff = effDash(field)!;
      const str = typeof value === "string" ? value : "";
      if (str.trim()) {
        filled = true;
        const docPrefix = field.prefix && !field.hidePrefixOnDoc ? field.prefix : "";
        const display = docPrefix + (eff.hard ? formatBoxPattern(str, eff.pattern) : formatSoftPattern(str, eff.pattern));
        content = (
          <span
            className="odoc-hotspot__text"
            style={{
              fontSize: `${(field.fontPct ?? 1.4) * 1.1}cqw`,
              justifyContent:
                field.align === "left"
                  ? "flex-start"
                  : field.align === "right"
                    ? "flex-end"
                    : "center",
            }}
          >
            {display}
          </span>
        );
      }
    } else if (field.boxes && field.boxes >= 1) {
      // 자릿수 네모칸: 각 칸에 한 글자씩 균등 분배
      const str = typeof value === "string" ? value : "";
      if (str.trim()) filled = true;
      content = (
        <span className="odoc-hotspot__boxes" style={{ fontSize: `${(field.fontPct ?? 1.4) * 1.1}cqw` }}>
          {Array.from({ length: field.boxes }).map((_, i) => (
            <span key={i} className="odoc-hotspot__boxcell">
              {str[i] ?? ""}
            </span>
          ))}
        </span>
      );
    } else {
      if (typeof value === "string" && value.trim()) {
        filled = true;
        content = (
          <span
            className="odoc-hotspot__text"
            style={{
              fontSize: `${(field.fontPct ?? 1.4) * 1.1}cqw`,
              justifyContent:
                field.align === "left"
                  ? "flex-start"
                  : field.align === "right"
                    ? "flex-end"
                    : "center",
            }}
          >
            {value}
          </span>
        );
      }
    }

    // 조건부 편집 불가(예: 은행계좌 선택 시 카드 필드) → 빈 블록도 숨기고 탭 불가
    const blocked = !!field.editableIf && values[field.editableIf] !== true;
    // 빈 입력칸(파란 블록)은 작성 중(미완료)이거나 완료문서에서 '수정'을 눌렀을 때만 표시.
    // 완료문서 보기모드에선 빈 블록을 숨겨 도장/서명만 깔끔하게 보이게 함.
    const showEmpty = !blocked && (!isCompleted || localEdit);
    const editable = highlightEdit && !field.fixedChecked && !field.autoToday && !blocked;
    const hideEmpty = !filled && !showEmpty; // 빈 칸인데 표시 안 함
    return (
      <div
        key={field.key}
        data-field={field.key}
        className={`odoc-hotspot ${filled ? "odoc-hotspot--filled" : showEmpty ? "odoc-hotspot--empty" : "odoc-hotspot--blocked"}${editable ? " odoc-hotspot--editable" : ""}`}
        style={style}
      >
        {hideEmpty ? null : content}
      </div>
    );
  }

  return (
    <div className={embedded ? "odoc-embedded" : "doc-page"}>
      {!embedded && (
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
      )}

      {error && <div className="error-banner no-print">{error}</div>}
      {toast && <div className="toast no-print">{toast}</div>}

      <ZoomableDocument aspectRatio={aspectRatio} onTapField={handleTapField}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={overlay.image} alt={overlay.title} className="odoc-image" draggable={false} />
        {overlay.fields.map((f) => renderFieldOverlay(f))}
      </ZoomableDocument>

      {!embedded && localEdit && (
        <div className="action-bar no-print">
          <button type="button" onClick={cancelEdits} disabled={saving}>
            취소
          </button>
          <button type="button" className="primary" onClick={handleEditDone} disabled={saving}>
            완료
          </button>
        </div>
      )}

      {!embedded && !localEdit && !isCompleted && (
        <div className="action-bar no-print">
          <button type="button" onClick={() => handleSubmit("draft")} disabled={saving}>
            임시저장
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => handleSubmit("completed")}
            disabled={saving}
          >
            {saving ? "저장 중..." : "작성 완료"}
          </button>
        </div>
      )}

      {/* 날짜 선택 팝업 — 보이는 date input을 탭하면 iOS/안드로이드 모두 네이티브 달력이 뜬다.
          선택값은 드래프트에 담고 '확인'을 눌러야 반영(iOS에서 자동확정/닫힘 방지) */}
      {dateGroupOpen && (
        <div className="sheet-overlay" onClick={() => setDateGroupOpen(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <div className="field-popup__label">날짜 선택</div>
            <InlineCalendar value={dateDraft} onSelect={setDateDraft} />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setDateGroupOpen(null)}>
                취소
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (dateDraft) applyDate(dateGroupOpen, dateDraft);
                  setDateGroupOpen(null);
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 목록 선택 팝업 (결제사명 등: 은행/카드사 목록) */}
      {openField && (openField.options || openField.optionsByCheckbox) && (
        <div className="sheet-overlay" onClick={() => setOpenField(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <div className="field-popup__label">
              {openField.optionsByCheckbox
                ? values["cb_card"] === true
                  ? "카드사 선택"
                  : values["cb_bank"] === true
                    ? "은행 선택"
                    : "결제수단을 먼저 선택하세요"
                : effLabel(openField) ?? "선택"}
            </div>
            {(() => {
              const opts = resolveOptions(openField) ?? [];
              if (opts.length === 0) {
                return (
                  <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 14, padding: "8px 0 4px" }}>
                    상단에서 은행계좌 또는 신용카드를 먼저 선택해 주세요.
                  </p>
                );
              }
              const cur = typeof values[openField.key] === "string" ? (values[openField.key] as string) : "";
              return (
                <div className="opt-list">
                  {opts.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={`opt-list__item${o === cur ? " opt-list__item--sel" : ""}`}
                      onClick={() => selectOption(openField, o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="field-popup__actions">
              <button type="button" onClick={() => setOpenField(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 입력 팝업 */}
      {openField && !openField.dateGroup && openField.type === "text" && !openField.options && !openField.optionsByCheckbox && (
        <div className="sheet-overlay" ref={popupRef} onClick={() => setOpenField(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <div className="field-popup__label">{effLabel(openField) ?? "입력"}</div>
            <div className={openField.prefix ? "field-popup__prefixrow" : undefined}>
              {openField.prefix && (
                <span className="field-popup__prefix">{openField.prefix}</span>
              )}
              {(() => {
                const eff = effDash(openField);
                return (
                  <input
                    type="text"
                    value={
                      eff
                        ? eff.hard
                          ? formatBoxPattern(textDraft, eff.pattern)
                          : formatSoftPattern(textDraft, eff.pattern)
                        : openField.boxPattern
                          ? formatBoxPattern(textDraft, openField.boxPattern)
                          : textDraft
                    }
                    placeholder={
                      eff
                        ? openField.prefix
                          ? `뒤 ${eff.pattern.reduce((a, b) => a + b, 0)}자리 입력`
                          : `${eff.pattern.reduce((a, b) => a + b, 0)}자리 숫자 입력`
                        : openField.boxPattern
                          ? `${openField.boxPattern.reduce((a, b) => a + b, 0)}자리 숫자 입력`
                          : openField.boxes
                            ? `${openField.boxes}자리 숫자 입력`
                            : openField.placeholder
                    }
                    inputMode={
                      eff || openField.boxPattern || openField.boxes ? "numeric" : undefined
                    }
                    onChange={(e) => {
                      if (eff) {
                        const digits = e.target.value.replace(/\D/g, "");
                        // 카드·은행 모두 해당 형식의 표준 자릿수까지만 입력 허용(초과 입력 차단)
                        const total = eff.pattern.reduce((a, b) => a + b, 0);
                        setTextDraft(digits.slice(0, total));
                      } else if (openField.boxPattern) {
                        const total = openField.boxPattern.reduce((a, b) => a + b, 0);
                        setTextDraft(e.target.value.replace(/\D/g, "").slice(0, total));
                      } else if (openField.boxes) {
                        setTextDraft(e.target.value.replace(/\D/g, "").slice(0, openField.boxes));
                      } else {
                        setTextDraft(e.target.value);
                      }
                    }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitText();
                    }}
                  />
                );
              })()}
            </div>
            <div className="field-popup__actions">
              <button type="button" onClick={() => setOpenField(null)}>
                취소
              </button>
              <button type="button" className="primary" onClick={commitText}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 팝업 */}
      {openField && openField.type === "signature" && (
        <div className="sheet-overlay" onClick={() => setOpenField(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <SignaturePad
              label={openField.label ?? "서명"}
              confirmLabel={openField.confirmText ?? "서명 확정"}
              existingUrl={sigUrls[openField.key]}
              onSave={(dataUrl) => handleSignatureSave(openField, dataUrl)}
            />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setOpenField(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* 저장 후: PDF로도 다시 저장할지 */}
      {pdfPromptOpen && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => setPdfPromptOpen(false)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">PDF 다시 저장</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 14, margin: "-4px 0 16px" }}>
              수정한 내용을 PDF로도 다시 저장하시겠습니까?
            </p>
            <div className="field-popup__actions">
              <button type="button" onClick={() => setPdfPromptOpen(false)}>
                아니오
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setPdfPromptOpen(false);
                  router.push(`/patients/${patientId}?pdf=1`);
                }}
              >
                예, PDF 업데이트
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 주소 검색(도로명/지번) */}
      {addrOpen && (
        <div className="sheet-overlay" onClick={() => setAddrOpen(false)}>
          <div className="sheet address-sheet" onClick={(e) => e.stopPropagation()}>
            {addrStage === "search" ? (
              <>
                <div className="field-popup__label">주소 검색 (도로명 · 지번)</div>
                <div ref={postcodeBoxRef} className="address-postcode" />
                <div className="field-popup__actions">
                  <button type="button" onClick={() => setAddrOpen(false)}>
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="field-popup__label">상세주소 입력</div>
                <div className="address-base">{addrBase}</div>
                <input
                  type="text"
                  value={addrDetail}
                  placeholder="상세주소 (동/호수 등, 선택)"
                  autoFocus
                  onChange={(e) => setAddrDetail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAddr();
                  }}
                />
                <div className="field-popup__actions">
                  <button type="button" onClick={() => setAddrStage("search")}>
                    다시 검색
                  </button>
                  <button type="button" className="primary" onClick={confirmAddr}>
                    확인
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const OverlayDocumentForm = forwardRef(OverlayDocumentFormInner);
export default OverlayDocumentForm;

// 팝업에 바로 뜨는 인라인 캘린더(네이티브 입력창 없이, iOS/안드로이드 동일 동작)
function InlineCalendar({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const init = valid ? new Date(value + "T00:00:00") : new Date();
  const [y, setY] = useState(init.getFullYear());
  const [m, setM] = useState(init.getMonth()); // 0-11

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => (m === 0 ? (setY(y - 1), setM(11)) : setM(m - 1));
  const nextMonth = () => (m === 11 ? (setY(y + 1), setM(0)) : setM(m + 1));

  return (
    <div className="cal">
      <div className="cal__head">
        <button type="button" className="cal__nav" onClick={prevMonth} aria-label="이전 달">
          ‹
        </button>
        <span className="cal__title">
          {y}년 {m + 1}월
        </span>
        <button type="button" className="cal__nav" onClick={nextMonth} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="cal__grid cal__grid--dow">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <span key={d} className="cal__dow">
            {d}
          </span>
        ))}
      </div>
      <div className="cal__grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} className="cal__cell cal__cell--empty" />;
          const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
          const sel = iso === value;
          return (
            <button
              key={i}
              type="button"
              className={`cal__cell${sel ? " cal__cell--sel" : ""}`}
              onClick={() => onSelect(iso)}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
