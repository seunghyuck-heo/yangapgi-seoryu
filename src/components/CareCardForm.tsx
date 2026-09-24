"use client";

import { useRouter } from "next/navigation";

interface CareCardFormProps {
  patientId: string;
  backHref: string;
}

// 양압기 환자관리카드 (별지 제5호 서식) — A4 한 장 재현. 편집 필드는 추후 지정.
export default function CareCardForm({ backHref }: CareCardFormProps) {
  const router = useRouter();

  const visitRows = Array.from({ length: 8 });

  return (
    <div className="doc-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="doc-page__back" onClick={() => router.push(backHref)}>
          ← 목록으로
        </button>
        <button type="button" onClick={() => window.print()}>
          인쇄 (A4)
        </button>
      </div>

      <div className="carecard-wrap">
        <div className="carecard-page">
          {/* 상단 머리말 */}
          <div className="cc-top">
            <span className="cc-top__form">[별지 제5호 서식]</span>
            <span className="cc-top__keep">(업체보관용)</span>
          </div>
          <h1 className="cc-title">양압기 환자관리카드</h1>
          <div className="cc-subrow">
            <span className="cc-note">
              ※ 자세한 유의사항 및 작성방법은 본 환자관리카드 서식의 뒤쪽 설명란을 참고하여 주시기 바랍니다.
            </span>
            <span className="cc-page">(앞 쪽)</span>
          </div>

          {/* ① 기본정보 */}
          <div className="cc-sec">① 기본정보</div>
          <table className="cc-table cc-basic">
            <tbody>
              <tr>
                <th className="cc-cat">환자</th>
                <td className="cc-lbl">성명</td>
                <td className="cc-val" />
                <td className="cc-lbl">생년월일</td>
                <td className="cc-val" />
                <td className="cc-lbl">연락처</td>
                <td className="cc-val" />
              </tr>
              <tr>
                <th className="cc-cat">준요양기관</th>
                <td className="cc-lbl">상호명</td>
                <td className="cc-val" />
                <td className="cc-lbl">연락처</td>
                <td className="cc-val" />
                <td className="cc-lbl">콜센터 번호</td>
                <td className="cc-val" />
              </tr>
              <tr>
                <th className="cc-cat">기기정보</th>
                <td className="cc-lbl">기기 관리번호</td>
                <td className="cc-val" />
                <td className="cc-lbl">제품명</td>
                <td className="cc-val" />
                <td className="cc-lbl">계약기간</td>
                <td className="cc-val" />
              </tr>
            </tbody>
          </table>

          {/* ② 장비설치 전 성능검사 */}
          <div className="cc-sec">② 장비설치 전 성능검사</div>
          <table className="cc-table">
            <tbody>
              <tr>
                <th className="cc-cat cc-cat--sm">날짜</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">점검내용</th>
                <td className="cc-check">[ ] 장비기능 &nbsp; [ ] 알람기능 &nbsp; [ ] 소독·세척</td>
                <th className="cc-cat cc-cat--sm">점검자 서명</th>
                <td className="cc-val" />
              </tr>
            </tbody>
          </table>

          {/* ③ 안전교육 */}
          <div className="cc-sec">③ 안전교육</div>
          <table className="cc-table">
            <tbody>
              <tr>
                <th className="cc-cat cc-cat--sm">날짜</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">교육내용</th>
                <td className="cc-check">[ ] 장비사용법 &nbsp; [ ] 응급상황 시 대처요령 &nbsp; [ ] 기타</td>
                <th className="cc-cat cc-cat--sm">환자 서명</th>
                <td className="cc-val" />
              </tr>
            </tbody>
          </table>

          {/* ④ 방문점검 서비스 기록 */}
          <div className="cc-sec">④ 방문점검 서비스 기록</div>
          <table className="cc-table cc-visit">
            <thead>
              <tr>
                <th rowSpan={2} className="cc-vh cc-vh--date">날짜</th>
                <th colSpan={3} className="cc-vh">방문점검</th>
                <th colSpan={3} className="cc-vh">방문 또는 유선점검</th>
                <th className="cc-vh">점검결과</th>
                <th colSpan={2} className="cc-vh">점검확인 서명</th>
              </tr>
              <tr>
                <th className="cc-vh cc-vh--sub">양압기 점검</th>
                <th className="cc-vh cc-vh--sub">소모품 점검</th>
                <th className="cc-vh cc-vh--sub">위생상태 점검</th>
                <th className="cc-vh cc-vh--sub">알람기능 작동여부</th>
                <th className="cc-vh cc-vh--sub">설정압력 유지여부</th>
                <th className="cc-vh cc-vh--sub">사용시간/ 사용상태</th>
                <th className="cc-vh cc-vh--sub">조치사항 (소독 및 소모품 교체 등)</th>
                <th className="cc-vh cc-vh--sub">준요양기관</th>
                <th className="cc-vh cc-vh--sub">환자(가족)</th>
              </tr>
            </thead>
            <tbody>
              {visitRows.map((_, i) => (
                <tr key={i}>
                  <td className="cc-vr cc-vr--date" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                  <td className="cc-vr" />
                </tr>
              ))}
            </tbody>
          </table>

          {/* ⑤ 설치 및 회수확인 */}
          <div className="cc-sec">⑤ 설치 및 회수확인</div>
          <table className="cc-table">
            <tbody>
              <tr>
                <th className="cc-cat cc-cat--sm">설치일자</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">회수일자</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">준요양기관</th>
                <td className="cc-val" />
                <th className="cc-cat cc-cat--sm">환자(가족)</th>
                <td className="cc-val" />
              </tr>
              <tr>
                <th className="cc-cat cc-cat--sm">기타사항</th>
                <td className="cc-val" colSpan={7} />
              </tr>
            </tbody>
          </table>

          <div className="cc-foot">210㎜ × 297㎜ [백상지(80g/㎡) 또는 중질지(80g/㎡)]</div>
        </div>
      </div>
    </div>
  );
}
