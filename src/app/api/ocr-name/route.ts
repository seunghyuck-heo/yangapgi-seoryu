import { NextResponse } from "next/server";

// 신분증 이미지에서 사람 이름(성명)만 추출 — Google Gemini(무료 등급) 비전 사용.
// 이미지는 서버에서 Google로 전송됩니다(온디바이스 아님).
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

  const prompt =
    "이 대한민국 신분증(주민등록증/운전면허증 등) 이미지에서 다섯 가지를 찾아 JSON으로만 답하세요. " +
    '형식: {"name":"홍길동","birth6":"810220","box":[ymin,xmin,ymax,xmax],"card":[ymin,xmin,ymax,xmax],"rotation":0} . ' +
    "name = 신분증에 적힌 사람의 성명(한글). 못 찾으면 빈 문자열. " +
    "birth6 = 주민등록번호 앞 6자리(생년월일 YYMMDD) 숫자만. 못 찾으면 빈 문자열. " +
    "box = 증명사진 속 사람의 얼굴(머리~턱, face) 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 여백 말고 얼굴에 밀착. 얼굴을 못 찾으면 null. " +
    "card = 신분증 카드/문서 전체 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 주변 배경(책상/손/그림자 등)은 제외하고 신분증 테두리에 밀착. 신분증 경계를 못 찾으면 null. " +
    "rotation = 증명사진 속 사람의 얼굴이 똑바로 보이도록(두 눈이 위, 코가 가운데, 입이 아래) 이 이미지를 시계방향으로 회전해야 하는 각도. 0, 90, 180, 270 중 하나. 얼굴이 이미 똑바르면 0. 얼굴이 거꾸로면 180.";

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 300,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `AI 호출 실패(${res.status})`, detail: t.slice(0, 300) }, { status: 502 });
    }

    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

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
    // 이름은 한글 2~5자만 허용
    const nm = name.match(/[가-힣]{2,5}/);
    name = nm ? nm[0] : "";
    return NextResponse.json({ name, birth6, box, card, rotation });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
