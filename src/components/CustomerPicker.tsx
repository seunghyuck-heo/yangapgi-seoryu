"use client";

import { useState } from "react";
import type { CustomerCandidate } from "@/lib/customerLookup";

// 동명이인 선택창(중앙 팝업) — 같은 이름이 시트에 여러 명일 때, 직원이 신분증을 보고 한 명을 고른다.
// 행을 눌러 '선택'(하이라이트)한 뒤 아래 [완료]를 눌러야 확정된다. (이름만으론 남의 주민번호를 못 붙임)
export default function CustomerPicker({
  name,
  candidates,
  onPick,
  onCancel,
}: {
  name: string;
  candidates: CustomerCandidate[];
  onPick: (c: CustomerCandidate, rank: number) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const chosen = sel != null ? candidates[sel] : null;

  return (
    <div className="sheet-overlay sheet-overlay--center" onClick={onCancel}>
      <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title sheet__title--name">동명이인 선택</div>
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13, marginTop: -4 }}>
          시트에 <b>{name}</b> 님이 {candidates.length}명 있습니다.
          <br />
          신분증을 보고 해당 고객을 선택하세요.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {candidates.map((c, i) => {
            const active = sel === i;
            return (
              <button
                key={c.customer_no}
                type="button"
                className="sheet__option"
                aria-pressed={active}
                style={{
                  display: "block",
                  textAlign: "left",
                  lineHeight: 1.45,
                  border: active ? "2px solid var(--brand)" : "1px solid var(--line, #e3e6ee)",
                  background: active ? "var(--brand-soft)" : undefined,
                }}
                onClick={() => setSel(i)}
              >
                <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                  {c.name} ({i + 1})
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)" }}>환자번호 {c.customer_no}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {[c.region, c.birth6 ? `생년월일 ${c.birth6}` : "", c.phone].filter(Boolean).join(" · ") || "추가 정보 없음"}
                </div>
              </button>
            );
          })}
        </div>
        <div className="field-popup__actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={!chosen}
            onClick={() => {
              if (chosen && sel != null) onPick(chosen, sel + 1);
            }}
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
