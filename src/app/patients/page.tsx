"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BottomTabs from "@/components/BottomTabs";
import DocStatusDots from "@/components/DocStatusDots";
import LoginRequired from "@/components/LoginRequired";
import { useUser } from "@/lib/supabase/useUser";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";

export default function PatientsPage() {
  const { user, loading: authLoading } = useUser();
  const [patients, setPatients] = useState<PatientWithDocuments[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadPatients(q?: string) {
    setLoading(true);
    try {
      const url = q ? `/api/patients?q=${encodeURIComponent(q)}` : "/api/patients";
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) {
        setPatients(json.patients);
      } else {
        setPatients([]);
      }
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setPatients([]);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
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
  }, [user]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadPatients(search);
  }

  const completeCount = (documents: PatientWithDocuments["documents"]) =>
    DOC_TYPE_ORDER.filter((t) => documents.some((d) => d.doc_type === t && d.status === "completed"))
      .length;

  return (
    <div className="tab-page">
      <header className="app-header">
        <h1 className="app-header__title">환자보기</h1>
      </header>

      <div className="tab-page__body">
        {authLoading ? (
          <p className="muted-text">불러오는 중...</p>
        ) : !user ? (
          <LoginRequired />
        ) : (
          <>
        <form onSubmit={handleSearchSubmit} className="patients-page__search">
          <input
            type="text"
            placeholder="환자 이름으로 검색해 주세요"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">검색</button>
        </form>

        {loading ? (
          <p className="muted-text">불러오는 중...</p>
        ) : patients.length === 0 ? (
          <div className="empty-state">등록된 환자가 없습니다. &quot;서식제출&quot; 탭에서 환자를 등록해 주세요.</div>
        ) : (
          <ul className="patient-list">
            {patients.map((patient) => (
              <li key={patient.id}>
                <Link href={`/patients/${patient.id}`} className="patient-list__item">
                  <div className="patient-list__avatar">{patient.name.slice(0, 1)}</div>
                  <div className="patient-list__name">{patient.name}</div>
                  <div className="patient-list__phone">{patient.phone || "-"}</div>
                  <DocStatusDots documents={patient.documents} />
                  <div className="patient-list__progress">
                    {completeCount(patient.documents)} / {DOC_TYPE_ORDER.length} 완료
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
          </>
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
