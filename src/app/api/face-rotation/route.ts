import { NextResponse } from "next/server";

// 잘라낸 얼굴 사진만 보고 '똑바로' 만들 회전각(0/90/180/270)을 판단 — 신분증 전체보다 정확
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ rotation: 0 });

  let dataUrl: string | undefined;
  try {
    const body = await req.json();
    dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : undefined;
  } catch {
    dataUrl = undefined;
  }
  const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ rotation: 0 });

  const prompt =
    "이 이미지는 사람 얼굴 사진입니다. 얼굴이 똑바로(두 눈이 위쪽, 코가 가운데, 입이 아래쪽) 보이게 하려면 이 이미지를 시계방향으로 몇 도 회전해야 합니까? " +
    '0, 90, 180, 270 중 하나의 숫자만 JSON {"rotation":N} 으로 답하세요. 이미 똑바르면 0, 거꾸로면 180.';

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: match[1], data: match[2] } }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 40,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) return NextResponse.json({ rotation: 0 });
    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    let rotation = 0;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.rotation === "number") {
        rotation = ((Math.round(parsed.rotation / 90) * 90) % 360 + 360) % 360;
      }
    } catch {
      const m = text.match(/\d+/);
      if (m) rotation = ((Math.round(parseInt(m[0], 10) / 90) * 90) % 360 + 360) % 360;
    }
    return NextResponse.json({ rotation });
  } catch {
    return NextResponse.json({ rotation: 0 });
  }
}
