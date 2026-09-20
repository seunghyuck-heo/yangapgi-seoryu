"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Customer {
  customer_no: number;
  name: string;
  region: string | null;
  chart: string | null;
  birth6: string | null;
  phone: string | null;
  insurance: string | null;
}

function fmtBirth(b: string | null): string {
  if (!b || b.length < 6) return b || "";
  return `${b.slice(0, 2)}.${b.slice(2, 4)}.${b.slice(4, 6)}`;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  async function loadList() {
    try {
      const res = await fetch("/api/customers");
      const json = await res.json();
      setCustomers(res.ok ? json.customers ?? [] : []);
    } catch {
      setCustomers([]);
    }
  }

  async function syncAndLoad() {
    setSyncing(true);
    try {
      await fetch("/api/customers/sync"); // 시트 → Supabase 동기화(실패해도 목록은 로드)
    } catch {
      // 무시
    }
    await loadList();
    setSyncing(false);
  }

  useEffect(() => {
    (async () => {
      await loadList(); // 우선 현재 데이터 즉시 표시
      setLoading(false);
      await syncAndLoad(); // 이어서 시트 최신으로 동기화
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchMode) searchRef.current?.focus();
  }, [searchMode]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? customers.filter((c) =>
        [c.customer_no, c.name, c.region, c.chart, c.birth6, c.phone, c.insurance]
          .map((v) => (v == null ? "" : String(v)).toLowerCase())
          .some((s) => s.includes(q))
      )
    : customers;

  return (
    <div className="tab-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="app-header__action" aria-label="뒤로" onClick={() => router.push("/settings")}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <header className="app-header app-header--sub">
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
                ref={searchRef}
                type="text"
                className="search-box__input"
                placeholder="이름·번호·전화·지사 검색"
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
              양압기 환자 리스트
            </h1>
            <div className="app-header__actions">
              <button
                type="button"
                className="app-header__action"
                aria-label="동기화"
                onClick={syncAndLoad}
                disabled={syncing}
              >
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={syncing ? { animation: "spin 0.8s linear infinite" } : undefined}>
                  <path d="M21 12a9 9 0 0 1-9 9c-2.5 0-4.8-1-6.4-2.7L3 16" />
                  <path d="M3 12a9 9 0 0 1 9-9c2.5 0 4.8 1 6.4 2.7L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M3 21v-5h5" />
                </svg>
              </button>
              <button
                type="button"
                className="app-header__action"
                aria-label="검색"
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
          <p className="muted-text" style={{ textAlign: "center", padding: "24px 0" }}>
            {q ? "검색 결과가 없습니다." : "고객 데이터가 없습니다."}
          </p>
        ) : (
          <div className="customer-list-wrap">
            <p className="customer-list__count">총 {visible.length}명</p>
            <ul className="customer-list">
              {visible.map((c) => (
                <li key={c.customer_no} className="customer-row">
                  <span className="customer-row__no">{c.customer_no}</span>
                  <div className="customer-row__body">
                    <div className="customer-row__top">
                      <span className="customer-row__name">{c.name}</span>
                      {c.region ? <span className="customer-row__region">{c.region}</span> : null}
                    </div>
                    <div className="customer-row__meta">
                      {fmtBirth(c.birth6)}
                      {c.phone ? ` · ${c.phone}` : ""}
                      {c.chart ? ` · 차트 ${c.chart}` : ""}
                    </div>
                    {c.insurance ? <div className="customer-row__meta">공단 {c.insurance}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
