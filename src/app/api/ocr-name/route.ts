import { NextResponse } from "next/server";

// 신분증 이미지에서 이름·생년월일·얼굴/카드 영역·주민번호를 추출 — Google Gemini(무료 등급) 비전 사용.
// 이미지는 서버에서 Google로 전송됩니다(온디바이스 아님).
//
// ⚠️ 이름 추출과 주민번호(전체 13자리) 추출은 '별도 호출'로 분리한다.
//    주민번호 뒷 7자리는 민감정보라, 한 호출에서 같이 요청하면 모델이 응답을 거부/변형해
//    이름까지 날아가는 일이 있었다(실측). 분리하면 주민번호 호출이 실패해도 이름은 항상 들어온다.

const MAIN_PROMPT =
  "이 대한민국 신분증(주민등록증/운전면허증 등) 이미지에서 다섯 가지를 찾아 JSON으로만 답하세요. " +
  '형식: {"name":"홍길동","birth6":"810220","box":[ymin,xmin,ymax,xmax],"card":[ymin,xmin,ymax,xmax],"rotation":0} . ' +
  "name = 신분증에 적힌 사람의 성명(한글). 못 찾으면 빈 문자열. " +
  "birth6 = 주민등록번호 앞 6자리(생년월일 YYMMDD) 숫자만. 못 찾으면 빈 문자열. " +
  "box = 증명사진 속 사람의 얼굴(머리~턱, face) 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 여백 말고 얼굴에 밀착. 얼굴을 못 찾으면 null. " +
  "card = 신분증 카드/문서 전체 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 주변 배경(책상/손/그림자 등)은 제외하고 신분증 테두리에 밀착. 신분증 경계를 못 찾으면 null. " +
  "rotation = 증명사진 속 사람의 얼굴이 똑바로 보이도록(두 눈이 위, 코가 가운데, 입이 아래) 이 이미지를 시계방향으로 회전해야 하는 각도. 0, 90, 180, 270 중 하나. 얼굴이 이미 똑바르면 0. 얼굴이 거꾸로면 180.";

// 주민번호 전용(최소 요청). 뒷자리 불확실하면 빈 문자열로.
const RRN_PROMPT =
  "이 신분증 이미지에서 주민등록번호를 숫자만(하이픈 없이) 읽어 JSON으로만 답하세요. " +
  '형식: {"rrn":"8102201234567"} . ' +
  "rrn = 주민등록번호 전체 13자리(앞6자리 생년월일 + 뒤7자리). 뒷자리가 안 보이거나 확실치 않으면 빈 문자열. 설명 금지, JSON만.";

async function callGemini(apiKey: string, prompt: string, mimeType: string, base64: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`AI 호출 실패(${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OCR 미설정(GEMINI_API_KEY 없음)" }, { status: 501 });
  }

  let dataUrl: string | undefined;
  try {
    const body = await req.json();
    dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : undefined;
  } catch {
    dataUrl = undefined;
  }
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return NextResponse.json({ error: "이미지가 없습니다" }, { status: 400 });
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: "이미지 형식 오류" }, { status: 400 });
  }
  const mimeType = match[1];
  const base64 = match[2];

  try {
    // 이름 호출(필수)과 주민번호 호출(부가, 실패해도 이름에 영향 없음)을 병렬 실행.
    const [text, rrnText] = await Promise.all([
      callGemini(apiKey, MAIN_PROMPT, mimeType, base64),
      callGemini(apiKey, RRN_PROMPT, mimeType, base64).catch(() => ""), // 주민번호 호출 실패는 무시
    ]);

    let name = "";
    let box: number[] | null = null;
    let card: number[] | null = null;
    let rotation = 0;
    let birth6 = "";
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.name === "string") name = parsed.name.replace(/\s/g, "");
      if (typeof parsed?.birth6 === "string") birth6 = parsed.birth6.replace(/\D/g, "").slice(0, 6);
      if (Array.isArray(parsed?.box) && parsed.box.length === 4 && parsed.box.every((n: unknown) => typeof n === "number")) {
        box = parsed.box as number[];
      }
      if (Array.isArray(parsed?.card) && parsed.card.length === 4 && parsed.card.every((n: unknown) => typeof n === "number")) {
        card = parsed.card as number[];
      }
      if (typeof parsed?.rotation === "number") {
        const r = ((Math.round(parsed.rotation / 90) * 90) % 360 + 360) % 360;
        rotation = r;
      }
    } catch {
      // JSON 파싱 실패 시 한글 이름만 정규식으로 회수
      const m = text.replace(/\s/g, "").match(/[가-힣]{2,5}/);
      name = m ? m[0] : "";
    }

    // 주민번호: 별도 호출 결과에서 13자리만 신뢰(부정확한 뒷자리 프리필 방지).
    let rrn = "";
    try {
      const d = (JSON.parse(rrnText)?.rrn ?? "").toString().replace(/\D/g, "");
      if (d.length === 13) rrn = d;
    } catch {
      const d = rrnText.replace(/\D/g, "");
      if (d.length === 13) rrn = d;
    }
    // 주민번호를 또렷이 읽었으면 birth6도 그 앞 6자리로 보정(둘 일치 보장)
    if (rrn) birth6 = rrn.slice(0, 6);

    // 이름은 한글 2~5자만 허용
    const nm = name.match(/[가-힣]{2,5}/);
    name = nm ? nm[0] : "";
    return NextResponse.json({ name, birth6, rrn, box, card, rotation });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
