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
      const groups = new Set<string>();
      for (const f of overlay.fields) if (f.autoToday && f.dateGroup) groups.add(f.dateGroup);
      for (const g of groups) {
        const parts = overlay.fields.filter((f) => f.dateGroup === g);
        const anyFilled = parts.some((f) => typeof next[f.key] === "string" && (next[f.key] as string).trim());
        if (anyFilled) continue;
        // 그룹별로 오늘(+오프셋 연수) 날짜 계산 (예: 위임 종료일 = 오늘+5년)
        const offY = parts.find((f) => f.autoTodayOffsetYears != null)?.autoTodayOffsetYears ?? 0;
        const dt = new Date();
        dt.setFullYear(dt.getFullYear() + offY);
        const y = String(dt.getFullYear());
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        next[`__d_${g}`] = `${y}-${m}-${d}`;
        for (const f of parts) {
          if (f.datePart === "y") next[f.key] = f.fullYear ? y : y.slice(2);
          else if (f.datePart === "m") next[f.key] = String(Number(m));
          else if (f.datePart === "d") next[f.key] = String(Number(d));
          else if (f.datePart === "full") next[f.key] = `${y}.${m}.${d}`;
        }
        changed = true;
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
    // 고정 체크·오늘날짜 자동 필드는 편집 불가
    if (field.fixedChecked || field.autoToday) return;

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
        }
        next[key] = !currently;
        return next;
      });
      return;
    }

    if (field.dateGroup) {
      // iOS Safari는 showPicker 미지원 → 팝업 안의 보이는 date input을 탭해 네이티브 달력 호출
      const cur = values[`__d_${field.dateGroup}`];
      setDateDraft(typeof cur === "string" ? cur : "");
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
  // (입력이 하나도 없으면 '작성 필요', 하나라도 있으면 '작성중'으로 표시됨)
  async function handleBack() {
    if (!preview && initialStatus !== "completed") {
      try {
        await fetch(`/api/documents/${patientId}/${docType}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form_data: values, status: "draft" }),
        });
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
      if (f.cover || f.staticText) return true; // 가림 박스·표시용 라벨은 입력 대상 아님
      if (f.optional) return true; // 선택 입력 항목(예: 자택 전화)
      if (f.requiredIf && values[f.requiredIf] !== true) return true; // 조건부 필수(예: 카드 선택 시에만)
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
          <img src={url} alt="서명" className="odoc-hotspot__sig" />
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
    } else if (field.dashPattern && field.dashPattern.length) {
      // 전화번호 등: 문서엔 접두어 + 하이픈 텍스트로 표시(네모칸 아님)
      const str = typeof value === "string" ? value : "";
      if (str.trim()) {
        filled = true;
        const docPrefix = field.prefix && !field.hidePrefixOnDoc ? field.prefix : "";
        const display = docPrefix + formatBoxPattern(str, field.dashPattern);
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

    const editable = highlightEdit && !field.fixedChecked && !field.autoToday;
    return (
      <div
        key={field.key}
        data-field={field.key}
        className={`odoc-hotspot ${filled ? "odoc-hotspot--filled" : "odoc-hotspot--empty"}${editable ? " odoc-hotspot--editable" : ""}`}
        style={style}
      >
        {content}
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

      {/* 텍스트 입력 팝업 */}
      {openField && !openField.dateGroup && openField.type === "text" && (
        <div className="sheet-overlay" ref={popupRef} onClick={() => setOpenField(null)}>
          <div className="sheet field-popup" onClick={(e) => e.stopPropagation()}>
            <div className="field-popup__label">{openField.label ?? "입력"}</div>
            <div className={openField.prefix ? "field-popup__prefixrow" : undefined}>
              {openField.prefix && (
                <span className="field-popup__prefix">{openField.prefix}</span>
              )}
              <input
                type="text"
                value={
                  openField.dashPattern
                    ? formatBoxPattern(textDraft, openField.dashPattern)
                    : openField.boxPattern
                      ? formatBoxPattern(textDraft, openField.boxPattern)
                      : textDraft
                }
                placeholder={
                  openField.dashPattern
                    ? `뒤 ${openField.dashPattern.reduce((a, b) => a + b, 0)}자리 입력`
                    : openField.boxPattern
                      ? `${openField.boxPattern.reduce((a, b) => a + b, 0)}자리 숫자 입력`
                      : openField.boxes
                        ? `${openField.boxes}자리 숫자 입력`
                        : openField.placeholder
                }
                inputMode={
                  openField.dashPattern || openField.boxPattern || openField.boxes
                    ? "numeric"
                    : undefined
                }
                onChange={(e) => {
                  if (openField.dashPattern) {
                    const total = openField.dashPattern.reduce((a, b) => a + b, 0);
                    setTextDraft(e.target.value.replace(/\D/g, "").slice(0, total));
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
