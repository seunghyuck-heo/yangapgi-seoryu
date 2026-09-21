"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OverlayDoc, OverlayField } from "@/lib/overlays/types";
import ZoomableDocument from "./ZoomableDocument";
import SignaturePad from "./SignaturePad";

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
  const popupRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const dateGroupRef = useRef<string | null>(null);

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
    const t = new Date();
    const y = String(t.getFullYear());
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
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

  function handleTapField(key: string) {
    const field = fieldByKey.get(key);
    if (!field) return;
    // 고정 체크·오늘날짜 자동 필드는 편집 불가
    if (field.fixedChecked || field.autoToday) return;

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
      dateGroupRef.current = field.dateGroup;
      const input = dateInputRef.current;
      if (input) {
        input.value =
          typeof values[`__d_${field.dateGroup}`] === "string"
            ? (values[`__d_${field.dateGroup}`] as string)
            : "";
        if (typeof input.showPicker === "function") {
          try {
            input.showPicker();
          } catch {
            input.focus();
          }
        } else {
          input.focus();
        }
      }
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

  // 편집 대상(텍스트·서명) 칸이 모두 채워졌는지
  function allFilled(): boolean {
    return overlay.fields.every((f) => {
      if (f.type === "checkbox") return true; // 체크박스는 필수 아님
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
      if (targetStatus === "completed") router.push(backHref);
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
      if (value || field.fixedChecked) {
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
        <span className="odoc-hotspot__boxes" style={{ fontSize: `${field.fontPct ?? 1.4}cqw` }}>
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
              fontSize: `${field.fontPct ?? 1.4}cqw`,
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
        <span className="odoc-hotspot__boxes" style={{ fontSize: `${field.fontPct ?? 1.4}cqw` }}>
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
              fontSize: `${field.fontPct ?? 1.4}cqw`,
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

    const editable = editMode && !field.fixedChecked && !field.autoToday;
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
          <button type="button" onClick={() => window.print()}>
            인쇄 (A4)
          </button>
        </div>
      )}

      {error && <div className="error-banner no-print">{error}</div>}
      {toast && <div className="toast no-print">{toast}</div>}

      <ZoomableDocument aspectRatio={aspectRatio} onTapField={handleTapField}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={overlay.image} alt={overlay.title} className="odoc-image" draggable={false} />
        {overlay.fields.map((f) => renderFieldOverlay(f))}
      </ZoomableDocument>

      {!embedded && (
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

      {/* 숨긴 날짜 입력: 파란 날짜 칸 탭 시 네이티브 캘린더 바로 호출 */}
      <input
        ref={dateInputRef}
        type="date"
        className="odoc-hidden-date"
        onChange={(e) => {
          if (e.target.value && dateGroupRef.current) applyDate(dateGroupRef.current, e.target.value);
        }}
      />

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
    </div>
  );
}

const OverlayDocumentForm = forwardRef(OverlayDocumentFormInner);
export default OverlayDocumentForm;
