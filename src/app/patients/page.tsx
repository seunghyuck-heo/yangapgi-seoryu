"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BottomTabs from "@/components/BottomTabs";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientWithDocuments[]>([]);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/patients")
      .then(async (res) => {
        const json = await res.json();
        if (ignore) return;
        setPatients(res.ok ? json.patients : []);
      })
      .catch(() => {
        if (!ignore) setPatients([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  const completeCount = (documents: PatientWithDocuments["documents"]) =>
    DOC_TYPE_ORDER.filter((t) => documents.some((d) => d.doc_type === t && d.status === "completed"))
      .length;

  const q = search.trim();
  const visible = q
    ? patients.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    : patients;

  return (
    <div className="tab-page">
      <header className="app-header">
        {searchMode ? (
          <div className="app-header__row">
            <button
              type="button"
              className="app-header__action"
              aria-label="뒤로"
              onClick={() => {
                setSearchMode(false);
                setSearch("");
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <input
              ref={searchInputRef}
              type="text"
              className="app-header__search"
              placeholder="환자 이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : (
          <div className="app-header__row">
            <h1 className="app-header__title" style={{ fontFamily: "var(--font-body)", fontWeight: 700 }}>
              환자 보기
            </h1>
            <button
              type="button"
              className="app-header__action"
              aria-label="환자 검색"
              onClick={() => setSearchMode(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
          </div>
        )}
      </header>

      <div className="tab-page__body">
        {loading ? null : visible.length === 0 ? (
          <div className="patients-empty">
            <div className="patients-empty__icon" aria-hidden>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
              </svg>
            </div>
            <p className="patients-empty__text">
              {q
                ? "검색 결과가 없습니다."
                : "등록된 환자가 없습니다. “서식 제출” 탭에서 서류를 작성하면 환자 폴더가 자동으로 만들어집니다."}
            </p>
          </div>
        ) : (
          <ul className="patient-list">
            {visible.map((patient) => {
              const done = completeCount(patient.documents);
              const total = DOC_TYPE_ORDER.length;
              const allDone = done >= total;
              return (
                <li key={patient.id}>
                  <Link href={`/patients/${patient.id}`} className="patient-list__item">
                    <div className="patient-list__avatar" aria-hidden>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                      </svg>
                    </div>
                    <div className="patient-list__name">{patient.name}</div>
                    <div className={`patient-list__progress ${allDone ? "patient-list__progress--done" : ""}`}>
                      {done} / {total} {allDone ? "완료" : ""}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
