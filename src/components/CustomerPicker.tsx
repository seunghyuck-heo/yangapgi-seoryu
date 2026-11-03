"use client";

import type { CustomerCandidate } from "@/lib/customerLookup";

// 동명이인 선택창 — 같은 이름이 시트에 여러 명일 때, 직원이 신분증을 보고 해당 고객을 고른다.
// (이름만으론 남의 주민번호를 붙일 수 없으므로 반드시 사람이 선택)
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
          {candidates.map((c, i) => (
            <button
              key={c.customer_no}
              type="button"
              className="sheet__option"
              style={{ display: "block", textAlign: "left", lineHeight: 1.4 }}
              onClick={() => onPick(c, i + 1)}
            >
              <div style={{ fontWeight: 700 }}>
                {c.name} · No.{c.customer_no} {candidates.length > 1 ? `(${i + 1})` : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {[c.region, c.birth6 ? `생년월일 ${c.birth6}` : "", c.phone].filter(Boolean).join(" · ") || "추가 정보 없음"}
              </div>
            </button>
          ))}
        </div>
        <button type="button" className="sheet__cancel" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
