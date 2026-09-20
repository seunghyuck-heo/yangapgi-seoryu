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
    "이 이미지는 대한민국 신분증(주민등록증/운전면허증 등)입니다. 신분증에 적힌 사람의 성명(이름)만 한글로 정확히 추출하세요. 설명이나 라벨 없이 이름만 답하세요. 이름을 찾을 수 없으면 빈 문자열로만 답하세요.";

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
          maxOutputTokens: 200,
          thinkingConfig: { thinkingBudget: 0 },
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
    const finishReason: string = json?.candidates?.[0]?.finishReason ?? "";
    // 한글 이름만 정리 (2~5자)
    const cleaned = text.replace(/\s/g, "");
    const m = cleaned.match(/[가-힣]{2,5}/);
    const name = m ? m[0] : "";
    return NextResponse.json({ name, debug: { raw: text.slice(0, 120), finishReason } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
