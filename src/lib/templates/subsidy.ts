import { DocumentTemplate } from "./types";

export const subsidyTemplate: DocumentTemplate = {
  docType: "subsidy_application",
  title: "건강보험 양압기 급여대상자 등록 신청서",
  subtitle:
    "요양비의 보험급여 기준 및 방법 [별지 제4호의4서식] · 담당의사의 사실 확인일로부터 90일 이내에 공단에 접수한 경우, 환자등록일은 사실 확인일이며, 환자등록일부터 처방전 발행 및 요양비 지급이 가능합니다.",
  sections: [
    {
      title: "① 수진자",
      rows: [
        { label: "성명", fields: [{ key: "patient_name", label: "성명", type: "text" }] },
        {
          label: "주민(외국인)등록번호",
          fields: [{ key: "patient_rrn", label: "주민등록번호", type: "text" }],
        },
        {
          label: "전화번호",
          fields: [
            { key: "patient_home_phone", label: "자택", type: "text" },
            { key: "patient_mobile_phone", label: "휴대전화", type: "text" },
          ],
        },
        {
          label: "등록결과통보(SMS)",
          fields: [
            {
              key: "sms_consent",
              label: "휴대전화로 등록결과 SMS 수신 동의 (미체크 시 '아니오')",
              type: "checkbox",
            },
          ],
        },
      ],
    },
    {
      title: "② 요양기관 확인란",
      rows: [
        {
          label: "진료과목",
          fields: [
            { key: "clinic_dept", label: "진료과목", type: "text", default: "이비인후과" },
          ],
        },
        {
          label: "진단확인일",
          fields: [{ key: "diagnosis_date", label: "진단확인일", type: "date" }],
        },
        {
          label: "상병명 / 상병코드",
          fields: [
            {
              key: "diagnosis_name",
              label: "상병명",
              type: "text",
              default: "폐색성 수면무호흡",
            },
            { key: "diagnosis_code", label: "상병코드", type: "text", default: "G47.30" },
          ],
        },
        {
          label: "제Ⅰ형 수면다원검사(Level Ⅰ) 실시일자",
          fields: [{ key: "level1_test_date", label: "실시일자", type: "date" }],
        },
        {
          label: "상병 및 검사방법 (성인, 해당 항목 체크)",
          fields: [
            { key: "adult_ahi15", label: "무호흡·저호흡 지수(AHI) 15 이상", type: "checkbox" },
            {
              key: "adult_ahi10_with_symptom",
              label: "AHI 10 이상 + 아래 동반 증상 중 하나",
              type: "checkbox",
            },
            { key: "adult_symptom_insomnia", label: "· 불면증", type: "checkbox" },
            { key: "adult_symptom_daytime_sleepiness", label: "· 주간졸음", type: "checkbox" },
            { key: "adult_symptom_cognitive", label: "· 인지기능 감소", type: "checkbox" },
            { key: "adult_symptom_mood", label: "· 기분장애", type: "checkbox" },
            {
              key: "adult_ahi5_with_symptom",
              label: "AHI 5 이상 + 아래 동반 질환 중 하나",
              type: "checkbox",
            },
            { key: "adult_symptom_hypertension", label: "· 고혈압", type: "checkbox" },
            { key: "adult_symptom_arrhythmia", label: "· 빈혈성 심장질환", type: "checkbox" },
            { key: "adult_symptom_stroke", label: "· 뇌졸중 기왕력", type: "checkbox" },
            { key: "adult_symptom_spo2_85", label: "· 산소포화도 85% 미만", type: "checkbox" },
          ],
        },
        {
          label: "상병 및 검사방법 (소아 12세 이하, 해당 항목 체크)",
          fields: [
            { key: "child_ahi5", label: "AHI 5 이상", type: "checkbox" },
            {
              key: "child_ahi1_with_symptom",
              label: "AHI 1 이상 + 아래 동반 증상 중 하나",
              type: "checkbox",
            },
            { key: "child_symptom_insomnia", label: "· 불면증", type: "checkbox" },
            { key: "child_symptom_daytime_sleepiness", label: "· 주간졸음", type: "checkbox" },
            { key: "child_symptom_inattention", label: "· 부주의-과행동증", type: "checkbox" },
            { key: "child_symptom_morning_headache", label: "· 아침두통", type: "checkbox" },
            { key: "child_symptom_behavior", label: "· 행동장애", type: "checkbox" },
            { key: "child_symptom_learning", label: "· 학습장애", type: "checkbox" },
            { key: "child_symptom_spo2_91", label: "· 산소포화도 91% 미만", type: "checkbox" },
          ],
        },
        {
          label: "제Ⅰ형 수면다원검사가 불가능한 경우",
          fields: [
            { key: "impossible_infant", label: "2세 이하 영유아", type: "checkbox" },
            {
              key: "impossible_uncooperative",
              label: "협조가 불가능한 질환자(선천이상 기형, 신경발달지연)",
              type: "checkbox",
            },
            {
              key: "co2_25pct_over_50",
              label: "EtCO2/TcCO2가 수면시간의 25% 이상에서 50mmHg 이상",
              type: "checkbox",
            },
            {
              key: "co2_twice_over_50",
              label: "2회 이상 실시한 EtCO2/TcCO2 결과가 모두 50mmHg 이상",
              type: "checkbox",
            },
          ],
        },
        {
          label: "확인일자",
          fields: [{ key: "confirm_date", label: "확인일자", type: "date" }],
        },
        {
          label: "요양기관명(기호)",
          fields: [
            {
              key: "clinic_name",
              label: "요양기관명(기호)",
              type: "text",
              default: "미사연세이비인후과 (41362047)",
            },
          ],
        },
        {
          label: "담당의사 성명(면허번호)",
          fields: [
            {
              key: "doctor_name",
              label: "담당의사 성명(면허번호)",
              type: "text",
              default: "한남수 (86307)",
            },
          ],
        },
        {
          label: "전문과목(전문의 자격번호)",
          fields: [
            {
              key: "doctor_specialty",
              label: "전문과목(전문의 자격번호)",
              type: "text",
              default: "이비인후과 (3426)",
            },
          ],
        },
      ],
    },
    {
      title: "③ 신청인",
      description:
        "위와 같이 건강보험 양압기 급여대상자 등록을 신청합니다. (국민건강보험공단 이사장 귀하)",
      rows: [
        { label: "신청일자", fields: [{ key: "apply_date", label: "신청일자", type: "date" }] },
        {
          label: "신청인",
          fields: [
            { key: "applicant_signature", label: "성명 (서명 또는 인)", type: "signature" },
            {
              key: "relationship_to_patient",
              label: "수진자와의 관계",
              type: "text",
              default: "본인",
            },
            { key: "applicant_phone", label: "전화번호", type: "text" },
          ],
        },
      ],
    },
  ],
};
