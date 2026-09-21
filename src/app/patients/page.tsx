"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BottomTabs, { PATIENTS_CHANGED_EVENT } from "@/components/BottomTabs";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";
import { isRegisteredPatient } from "@/lib/patientStatus";

// 탭 전환/재진입 시 즉시 표시하기 위한 클라이언트 캐시 (stale-while-revalidate)
let patientsCache: PatientWithDocuments[] | null = null;
const PATIENTS_CACHE_KEY = "patients_cache_v1";

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientWithDocuments[]>(patientsCache ?? []);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [loading, setLoading] = useState(patientsCache == null);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; value: string } | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  function persist(list: PatientWithDocuments[]) {
    patientsCache = list;
    try {
      sessionStorage.setItem(PATIENTS_CACHE_KEY, JSON.stringify(list));
    } catch {
      // 저장 실패 무시
    }
  }

  // 서버에서 최신 목록을 받아 화면·캐시 갱신. 실패해도 기존 목록 유지.
  function loadPatients() {
    return fetch("/api/patients")
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setPatients(json.patients);
        persist(json.patients);
      })
      .catch(() => {
        // 네트워크 오류 시 캐시 유지
      });
  }

  useEffect(() => {
    // 1) 모듈 캐시가 없으면 세션 캐시로 즉시 표시
    if (patientsCache == null) {
      try {
        const s = sessionStorage.getItem(PATIENTS_CACHE_KEY);
        if (s) {
          const list = JSON.parse(s) as PatientWithDocuments[];
          patientsCache = list;
          setPatients(list);
          setLoading(false);
        }
      } catch {
        // 무시
      }
    }
    // 2) 항상 백그라운드로 최신화 (체감상 즉시 뜨고, 데이터는 조용히 갱신)
    let ignore = false;
    fetch("/api/patients")
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (ignore) return;
        setPatients(json.patients);
        persist(json.patients);
      })
      .catch(() => {
        // 캐시 유지
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // 서류 완료 등으로 목록이 바뀌면 백그라운드 갱신
  useEffect(() => {
    const onChanged = () => loadPatients();
    window.addEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PATIENTS_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  const completeCount = (documents: PatientWithDocuments["documents"]) =>
    DOC_TYPE_ORDER.filter((t) => documents.some((d) => d.doc_type === t && d.status === "completed"))
      .length;

  // 신분증 업로드 + 이름 입력이 끝난 환자만 표시 (서식만 열었다 나온 빈 폴더 제외)
  const realPatients = patients.filter(isRegisteredPatient);
  const q = search.trim().toLowerCase();
  const visible = q
    ? realPatients.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.customer_no != null && String(p.customer_no).includes(q)) ||
          (p.phone ?? "").toLowerCase().includes(q)
      )
    : realPatients;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitEdit() {
    setEditMode(false);
    setSelected(new Set());
  }

  async function saveRename() {
    if (!renameTarget) return;
    const name = renameTarget.value.trim();
    if (!name) return;
    setRenameSaving(true);
    try {
      await fetch(`/api/patients/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await loadPatients();
      setRenameTarget(null);
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 환자 ${selected.size}명을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))
      return;
    setDeleting(true);
    try {
      await Promise.all(
        [...selected].map((id) => fetch(`/api/patients/${id}`, { method: "DELETE" }))
      );
      await loadPatients();
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
      }
      exitEdit();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="tab-page">
      <header className="app-header">
        {searchMode ? (
          <div className="app-header__row app-header__row--search">
            <div className="search-box">
              <span className="search-box__icon" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="search-box__input"
                placeholder="이름·번호·전화 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="search-close"
              aria-label="닫기"
              onClick={() => {
                setSearchMode(false);
                setSearch("");
              }}
            >
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4 20 20" />
                <path d="M20 4 4 20" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="app-header__row">
            <h1 className="app-header__title" style={{ fontFamily: "var(--font-body)", fontWeight: 800 }}>
              환자 보기
            </h1>
            <div className="app-header__actions">
              <button
                type="button"
                className="app-header__action"
                aria-label="편집"
                onClick={() => (editMode ? exitEdit() : setEditMode(true))}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
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
          <>
            {!q && <p className="patient-list__count">총 {realPatients.length}명</p>}
            <ul className="patient-list">
            {visible.map((patient) => {
              const done = completeCount(patient.documents);
              const total = DOC_TYPE_ORDER.length;
              const allDone = done >= total;
              const checked = selected.has(patient.id);

              const inner = (
                <>
                  {editMode && (
                    <span className={`patient-list__check ${checked ? "patient-list__check--on" : ""}`} aria-hidden>
                      {checked && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                  )}
                  <div className="patient-list__avatar" aria-hidden>
                    {patient.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={patient.photo_url} alt="" className="patient-list__photo" />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                      </svg>
                    )}
                  </div>
                  <div className="patient-list__name">
                    {patient.name}
                    {patient.customer_no != null && (
                      <span className="patient-list__no">(No. {patient.customer_no})</span>
                    )}
                    {!editMode && patient.name === "새 환자" && (
                      <button
                        type="button"
                        className="patient-list__rename"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRenameTarget({ id: patient.id, value: "" });
                        }}
                      >
                        이름 입력하기
                      </button>
                    )}
                  </div>
                  <div className={`patient-list__progress ${allDone ? "patient-list__progress--done" : ""}`}>
                    {done} / {total} {allDone ? "완료" : ""}
                  </div>
                </>
              );

              return (
                <li key={patient.id}>
                  {editMode ? (
                    <button
                      type="button"
                      className={`patient-list__item patient-list__item--edit ${checked ? "patient-list__item--checked" : ""}`}
                      onClick={() => toggleSelect(patient.id)}
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link href={`/patients/${patient.id}`} className="patient-list__item">
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
            </ul>
          </>
        )}
      </div>

      {editMode && (
        <div className="edit-actionbar no-print">
          <button type="button" className="edit-actionbar__cancel" onClick={exitEdit}>
            취소
          </button>
          <button
            type="button"
            className="edit-actionbar__delete"
            onClick={handleDelete}
            disabled={selected.size === 0 || deleting}
          >
            {deleting ? "삭제 중..." : `삭제하기${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      )}

      {renameTarget && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => setRenameTarget(null)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">환자 이름 입력</div>
            <input
              type="text"
              value={renameTarget.value}
              placeholder="환자 이름"
              autoFocus
              onChange={(e) => setRenameTarget((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
              }}
            />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setRenameTarget(null)}>
                취소
              </button>
              <button type="button" className="primary" onClick={saveRename} disabled={renameSaving}>
                {renameSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}
