import { DocumentTemplate } from "./types";

export const cmsTemplate: DocumentTemplate = {
  docType: "cms_autopay",
  title: "CMS 자동이체신청서",
  subtitle: "금융기관 및 결제대행사(효성에프엠에스㈜) 제출용",
  sections: [
    {
      title: "수납업체 및 목적",
      rows: [
        {
          label: "수납업체",
          fields: [
            { key: "biller_name", label: "수납업체", type: "text", default: "엠와이메디칼" },
            {
              key: "biller_purpose",
              label: "수납목적",
              type: "text",
              default: "양압기 대여 수금",
            },
          ],
        },
        {
          label: "대표자 / 사업자등록번호",
          fields: [
            { key: "biller_ceo", label: "대표자", type: "text", default: "손인경" },
            {
              key: "biller_reg_no",
              label: "사업자등록번호",
              type: "text",
              default: "191-21-01071",
            },
          ],
        },
        {
          label: "주소",
          fields: [
            {
              key: "biller_address",
              label: "주소",
              type: "text",
              default: "경기도 하남시 미사강변동로 73 노블레스 501호",
            },
          ],
        },
      ],
    },
    {
      title: "자동이체 신청내용",
      rows: [
        {
          label: "신청인",
          fields: [
            {
              key: "applicant_name_signature",
              label: "신청인 성명 (자필로 직접 기재)",
              type: "signature",
            },
            { key: "applicant_relationship", label: "예금주와의 관계", type: "text" },
            { key: "applicant_phone", label: "연락처", type: "text" },
          ],
        },
        {
          label: "납부금액",
          fields: [
            { key: "fixed_amount_checked", label: "고정금액", type: "checkbox" },
            { key: "fixed_amount_value", label: "고정금액(원)", type: "text" },
            {
              key: "variable_amount_checked",
              label: "변동(추가 계약내용에 따름)",
              type: "checkbox",
            },
          ],
        },
        {
          label: "납부일",
          fields: [
            { key: "pay_day", label: "매월 며칠", type: "text", placeholder: "예: 25" },
          ],
        },
        {
          label: "납부방법",
          fields: [
            { key: "pay_by_bank_cms", label: "은행계좌(CMS)", type: "checkbox" },
            { key: "pay_by_credit_card", label: "신용카드", type: "checkbox" },
          ],
        },
        {
          label: "결제사명 (은행, 카드사, 통신사)",
          fields: [
            { key: "payment_company", label: "결제사명", type: "text" },
            { key: "payer_name", label: "결제자명", type: "text" },
          ],
        },
        {
          label: "계좌 / 카드번호",
          fields: [{ key: "account_or_card_no", label: "계좌·카드번호", type: "text" }],
        },
        {
          label: "결제자 생년월일 (개인계좌인 경우 6자리)",
          fields: [{ key: "payer_birthdate", label: "생년월일 6자리", type: "text" }],
        },
        {
          label: "결제 사업자번호 (법인계좌인 경우)",
          fields: [{ key: "payer_biz_no", label: "사업자번호", type: "text" }],
        },
        {
          label: "예금주",
          fields: [{ key: "account_holder_name", label: "예금주", type: "text" }],
        },
        {
          label: "휴대전화번호",
          fields: [{ key: "applicant_mobile_phone", label: "휴대전화번호", type: "text" }],
        },
        {
          label: "개인정보 수집·이용 동의",
          fields: [
            {
              key: "consent_collect",
              label: "개인정보 수집 및 이용에 동의합니다",
              type: "checkbox",
            },
            {
              key: "consent_third_party",
              label: "개인정보 제3자 제공에 동의합니다",
              type: "checkbox",
            },
          ],
        },
      ],
    },
    {
      title: "신청 확인",
      description:
        "신청인(예금주)은 신청정보, 금융거래정보 등 개인정보의 수집·이용, 제3자 제공 및 월자동납부에 동의하며 상기와 같이 신청합니다.",
      rows: [
        { label: "신청일자", fields: [{ key: "apply_date", label: "신청일자", type: "date" }] },
        {
          label: "신청인 서명",
          fields: [{ key: "applicant_signature", label: "신청인 (서명 또는 인)", type: "signature" }],
        },
        {
          label: "예금주 서명 (신청인과 다른 경우)",
          fields: [{ key: "depositor_signature", label: "예금주 (서명 또는 인)", type: "signature" }],
        },
      ],
    },
  ],
};
