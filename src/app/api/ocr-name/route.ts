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
    "이 대한민국 신분증(주민등록증/운전면허증 등) 이미지에서 두 가지를 찾아 JSON으로만 답하세요. " +
    '형식: {"name":"홍길동","box":[ymin,xmin,ymax,xmax]} . ' +
    "name = 신분증에 적힌 사람의 성명(한글). 못 찾으면 빈 문자열. " +
    "box = 증명사진 속 사람의 얼굴(머리~턱, face) 영역만 딱 맞게 감싼 경계 상자를 0~1000으로 정규화한 정수 좌표. " +
    "여백이나 신분증 배경 말고 얼굴에 최대한 밀착. 얼굴을 못 찾으면 null.";

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
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.name === "string") name = parsed.name.replace(/\s/g, "");
      if (Array.isArray(parsed?.box) && parsed.box.length === 4 && parsed.box.every((n: unknown) => typeof n === "number")) {
        box = parsed.box as number[];
      }
    } catch {
      // JSON 파싱 실패 시 한글 이름만 정규식으로 회수
      const m = text.replace(/\s/g, "").match(/[가-힣]{2,5}/);
      name = m ? m[0] : "";
    }
    // 이름은 한글 2~5자만 허용
    const nm = name.match(/[가-힣]{2,5}/);
    name = nm ? nm[0] : "";
    return NextResponse.json({ name, box });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
