import { DocumentTemplate } from "./types";

export const poaTemplate: DocumentTemplate = {
  docType: "power_of_attorney",
  title: "요양비 지급청구 위임장",
  subtitle:
    "국민건강보험법 시행규칙 [별지 제19호의6서식] <개정 2022. 10. 26.> · 뒤쪽의 유의사항을 읽고 작성해 주시기 바랍니다.",
  sections: [
    {
      title: "① 위임인",
      rows: [
        {
          label: "가입자 또는 피부양자",
          fields: [
            { key: "insured_name", label: "성명", type: "text" },
            { key: "insured_rrn", label: "주민(외국인)등록번호", type: "text" },
          ],
        },
        {
          label: "법정대리인 또는 가족",
          fields: [
            { key: "guardian_name", label: "성명", type: "text" },
            { key: "guardian_birthdate", label: "생년월일", type: "date" },
            { key: "guardian_relationship", label: "가입자·피부양자와의 관계", type: "text" },
          ],
        },
        {
          label: "전화번호 (위임사항 및 지급내역 수신용)",
          fields: [
            { key: "delegator_phone", label: "전화번호", type: "text" },
            {
              key: "sms_consent",
              label: "문자메시지 수신동의",
              type: "checkbox",
              default: true,
            },
          ],
        },
      ],
    },
    {
      title: "② 준요양기관",
      rows: [
        {
          label: "상호",
          fields: [
            { key: "agency_name", label: "상호", type: "text", default: "엔큐에스 주식회사" },
          ],
        },
        {
          label: "사업자등록번호(법인등록번호)",
          fields: [
            {
              key: "agency_reg_no",
              label: "사업자등록번호",
              type: "text",
              default: "677-88-02709",
            },
          ],
        },
        {
          label: "대표자",
          fields: [
            { key: "agency_ceo", label: "대표자", type: "text", default: "손인경" },
          ],
        },
        {
          label: "전화번호",
          fields: [
            {
              key: "agency_phone",
              label: "전화번호",
              type: "text",
              default: "031-794-2460",
            },
          ],
        },
      ],
    },
    {
      title: "③ 요양비 수령계좌",
      rows: [
        {
          label: "수령자",
          fields: [
            {
              key: "receiver_name",
              label: "수령자",
              type: "text",
              default: "엔큐에스 주식회사",
            },
          ],
        },
        {
          label: "수령계좌",
          fields: [
            {
              key: "bank_name",
              label: "금융기관명",
              type: "text",
              default: "신한은행",
            },
            {
              key: "bank_account_holder",
              label: "예금주",
              type: "text",
              default: "엔큐에스(주)손인경",
            },
            {
              key: "bank_account_no",
              label: "계좌번호",
              type: "text",
              default: "100-036-347832",
            },
          ],
        },
      ],
    },
    {
      title: "④ 위임사항 (해당 항목 모두 체크 가능)",
      rows: [
        {
          fields: [
            {
              key: "item_dialysis_supplies",
              label: "1) 자동복막투석 소모성 재료",
              type: "checkbox",
            },
            { key: "item_peritoneal_fluid", label: "1) 복막관류액", type: "checkbox" },
            { key: "item_home_oxygen", label: "2) 가정용 산소발생기", type: "checkbox" },
            { key: "item_portable_oxygen", label: "2) 휴대용 산소발생기", type: "checkbox" },
            { key: "item_diabetes_supplies", label: "3) 당뇨병 소모성 재료", type: "checkbox" },
            {
              key: "item_cgm_sensor",
              label: "3) 연속혈당측정용 전극(센서)",
              type: "checkbox",
            },
            {
              key: "item_self_catheter",
              label: "4) 자가도뇨 소모성 재료",
              type: "checkbox",
            },
            {
              key: "item_ventilator_basic",
              label: "5) 인공호흡기 및 기본소모품",
              type: "checkbox",
            },
            { key: "item_ventilator_optional", label: "5) 선택소모품", type: "checkbox" },
            { key: "item_cough_assist", label: "6) 기침유발기", type: "checkbox" },
            {
              key: "item_cpap_supplies",
              label: "7) 양압기 및 소모품",
              type: "checkbox",
              default: true,
            },
            { key: "item_cgm_device", label: "8) 연속혈당측정기", type: "checkbox" },
            { key: "item_insulin_pump", label: "8) 인슐린자동주입기", type: "checkbox" },
            { key: "item_delivery_cost", label: "9) 출산비", type: "checkbox" },
          ],
        },
      ],
    },
    {
      title: "⑤ 위임기간",
      description: "위임 기간은 최장 5년간 가능하며, 만료 후에는 자동해지 됩니다.",
      rows: [
        {
          fields: [
            { key: "delegation_start_date", label: "시작일", type: "date" },
            { key: "delegation_end_date", label: "종료일", type: "date" },
          ],
        },
      ],
    },
    {
      title: "위임인 확인",
      description:
        "「국민건강보험법」 제49조제3항 및 같은 법 시행규칙 제23조제4항에 따라 요양비 지급 청구에 관한 사항을 위와 같이 위임합니다.",
      rows: [
        { label: "작성일", fields: [{ key: "sign_date", label: "작성일", type: "date" }] },
        {
          label: "위임인 서명",
          fields: [{ key: "delegator_signature", label: "위임인 (서명 또는 인)", type: "signature" }],
        },
      ],
    },
  ],
};
