"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import BottomTabs, { PATIENTS_CHANGED_EVENT } from "@/components/BottomTabs";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";

const PAGE_SIZE = 100;

// 탭 전환/재진입 시 즉시 표시하기 위한 클라이언트 캐시 (stale-while-revalidate)
interface PatientsCacheShape {
  patients: PatientWithDocuments[];
  total: number;
  hasMore: boolean;
}
let patientsCache: PatientsCacheShape | null = null;
const PATIENTS_CACHE_KEY = "patients_cache_v2";

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientWithDocuments[]>(patientsCache?.patients ?? []);
  const [total, setTotal] = useState<number>(patientsCache?.total ?? 0);
  const [hasMore, setHasMore] = useState<boolean>(patientsCache?.hasMore ?? false);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [loading, setLoading] = useState(patientsCache == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; value: string } | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const patientsRef = useRef(patients);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(false);
  const queryRef = useRef(""); // 현재 적용된 검색어
  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  function persist(shape: PatientsCacheShape) {
    patientsCache = shape;
    try {
      sessionStorage.setItem(PATIENTS_CACHE_KEY, JSON.stringify(shape));
    } catch {
      // 저장 실패 무시
    }
  }

  // 검색어 q로 첫 페이지 로드(초기화). 검색어 없을 때만 캐시.
  const loadFirst = useCallback((q: string) => {
    queryRef.current = q;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
    if (q) params.set("q", q);
    return fetch(`/api/patients?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        const list = (json.patients ?? []) as PatientWithDocuments[];
        const t = typeof json.total === "number" ? json.total : list.length;
        const hm = !!json.hasMore;
        setPatients(list);
        setTotal(t);
        setHasMore(hm);
        if (!q) persist({ patients: list, total: t, hasMore: hm });
      })
      .catch(() => {
        // 네트워크 오류 시 기존 유지
      })
      .finally(() => setLoading(false));
  }, []);

  // 스크롤로 다음 페이지 추가 로드
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const q = queryRef.current;
    const offset = patientsRef.current.length;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (q) params.set("q", q);
    fetch(`/api/patients?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        const more = (json.patients ?? []) as PatientWithDocuments[];
        const t = typeof json.total === "number" ? json.total : undefined;
        const hm = !!json.hasMore;
        setPatients((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev, ...more.filter((p) => !seen.has(p.id))];
          if (!q) persist({ patients: merged, total: t ?? merged.length, hasMore: hm });
          return merged;
        });
        if (t != null) setTotal(t);
        setHasMore(hm);
      })
      .catch(() => {})
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, []);

  const reload = useCallback(() => loadFirst(queryRef.current), [loadFirst]);

  // 세션 캐시로 즉시 표시(네트워크 없음)
  useEffect(() => {
    if (patientsCache == null) {
      try {
        const s = sessionStorage.getItem(PATIENTS_CACHE_KEY);
        if (s) {
          const c = JSON.parse(s) as PatientsCacheShape;
          patientsCache = c;
          setPatients(c.patients);
          setTotal(c.total);
          setHasMore(c.hasMore);
          setLoading(false);
        }
      } catch {
        // 무시
      }
    }
  }, []);

  // 검색어(디바운스)로 서버 조회. 최초 마운트(빈 검색어)도 여기서 로드.
  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => loadFirst(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, loadFirst]);

  // 서류 완료/삭제 등으로 목록이 바뀌면 현재 검색 기준으로 갱신
  useEffect(() => {
    const onChanged = () => reload();
    window.addEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PATIENTS_CHANGED_EVENT, onChanged);
  }, [reload]);

  // 무한 스크롤: 센티넬이 보이면 다음 페이지 로드
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, patients.length]);

  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  const completeCount = (documents: PatientWithDocuments["documents"]) =>
    DOC_TYPE_ORDER.filter((t) => documents.some((d) => d.doc_type === t && d.status === "completed"))
      .length;

  // 서버가 이미 '등록 환자' 필터 + 검색을 적용한 목록
  const visible = patients;
  const q = search.trim();

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
      await reload();
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
      await reload();
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
          <div className="patient-list-wrap">
            {!q && <p className="patient-list__count">총 {total}명</p>}
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
            {hasMore && <div ref={sentinelRef} className="patient-list__sentinel" aria-hidden />}
            {loadingMore && <p className="patient-list__more">불러오는 중…</p>}
          </div>
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
