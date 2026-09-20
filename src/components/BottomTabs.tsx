"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";
import type { PatientWithDocuments } from "@/lib/db/types";
import { isRegisteredPatient } from "@/lib/patientStatus";

const stroke = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS = {
  submit: (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      <path d="M9 13h4" />
      <path d="M9 17h3" />
      <path d="M17.5 3.5a2.12 2.12 0 0 1 3 3L15 12l-3 .7.7-3z" />
    </svg>
  ),
  patients: (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </svg>
  ),
  settings: (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const TABS = [
  { href: "/submit", label: "서식 제출", icon: ICONS.submit },
  { href: "/patients", label: "환자 보기", icon: ICONS.patients },
  { href: "/settings", label: "설정", icon: ICONS.settings },
];

// 탭 이동 시 배지가 0→N으로 깜빡이지 않도록 마지막 값을 모듈에 보관
let cachedInProgress = 0;
// 환자 목록 변경(신분증 확인/삭제 등)을 배지에 즉시 반영하기 위한 이벤트명
export const PATIENTS_CHANGED_EVENT = "patients-changed";

export default function BottomTabs() {
  const pathname = usePathname();
  const [inProgress, setInProgress] = useState(cachedInProgress);

  // 진행중(작성 미완료) 환자 수 → 환자 보기 탭 배지 (내용 없는 빈 폴더는 제외)
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/patients");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const patients = (json.patients ?? []) as PatientWithDocuments[];
        const count = patients.filter((p) => {
          if (!isRegisteredPatient(p)) return false; // 신분증+이름 전엔 카운팅 안 함
          const done = DOC_TYPE_ORDER.filter((t) =>
            p.documents.some((d) => d.doc_type === t && d.status === "completed")
          ).length;
          return done < DOC_TYPE_ORDER.length;
        }).length;
        cachedInProgress = count;
        setInProgress(count);
      } catch {
        // 무시
      }
    }
    refresh();
    const onChanged = () => refresh();
    window.addEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    };
  }, [pathname]);

  return (
    <nav className="bottom-tabs no-print">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const badge = tab.href === "/patients" && inProgress > 0 ? inProgress : null;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-tabs__tab ${active ? "bottom-tabs__tab--active" : ""}`}
          >
            <span className="bottom-tabs__icon">
              {tab.icon}
              {badge !== null && <span className="bottom-tabs__badge">{badge}</span>}
            </span>
            <span className="bottom-tabs__label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
