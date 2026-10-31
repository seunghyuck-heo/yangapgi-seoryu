import { NextResponse } from "next/server";

export const maxDuration = 60; // 폴백 체인(최대 ~45s) 동안 함수가 끊기지 않도록

// 신분증 이미지에서 이름·생년월일·얼굴/카드 영역·회전·주민번호를 '한 번의 호출'로 추출 — Gemini 비전.
// 이미지는 서버에서 Google로 전송됩니다(온디바이스 아님).
//
// ⚠️ 호출 수를 신분증 1장당 최소로 유지한다(무료 쿼터 429 방지). 주민번호를 위해 별도 호출을
//    추가했더니 쿼터가 더 빨리 소진돼 429로 이름까지 실패했음(v273 회귀) → 한 호출로 통합(v274).
//    name은 반드시 채우도록 지시하고, rrn(주민번호 전체)은 못 읽으면 빈 문자열(선택).

const PROMPT =
  "이 대한민국 신분증(주민등록증/운전면허증 등) 이미지에서 여섯 가지를 찾아 JSON으로만 답하세요. " +
  '형식: {"name":"홍길동","birth6":"810220","rrn":"8102201234567","box":[ymin,xmin,ymax,xmax],"card":[ymin,xmin,ymax,xmax],"rotation":0} . ' +
  "name = 신분증에 적힌 사람의 성명(한글). 가장 중요하니 반드시 채운다. 못 찾으면 빈 문자열. " +
  "birth6 = 주민등록번호 앞 6자리(생년월일 YYMMDD) 숫자만. 못 찾으면 빈 문자열. " +
  "rrn = 주민등록번호 전체 13자리(앞6+뒤7) 숫자만, 하이픈 없이. 뒷자리가 안 보이거나 확실치 않으면 빈 문자열. rrn이 비어도 name·birth6·box·card·rotation은 반드시 채운다. " +
  "box = 증명사진 속 사람의 얼굴(머리~턱, face) 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 여백 말고 얼굴에 밀착. 얼굴을 못 찾으면 null. " +
  "card = 신분증 카드/문서 전체 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 주변 배경(책상/손/그림자 등)은 제외하고 신분증 테두리에 밀착. 신분증 경계를 못 찾으면 null. " +
  "rotation = 증명사진 속 사람의 얼굴이 똑바로 보이도록(두 눈이 위, 코가 가운데, 입이 아래) 이 이미지를 시계방향으로 회전해야 하는 각도. 0, 90, 180, 270 중 하나. 얼굴이 이미 똑바르면 0. 얼굴이 거꾸로면 180.";

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

  // 무료 한도는 '모델별로 따로'다. 한 모델이 429(한도 소진)면 다음 모델로 넘어간다(모두 무료 flash).
  // 503(과부하)은 같은 모델 한 번 더. OCR 정확도 위해 capable 모델 우선, lite는 뒤로.
  const envModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const MODELS = [...new Set([
    envModel,
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
  ])];
  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
    },
  });

  try {
    // 느린/과부하 모델에 오래 매달리지 않도록 호출마다 타임아웃(12s) + 전체 상한(45s)을 둔다.
    // (쿼터 소진 모델은 빠르게 429로 떨어지고, 건강한 모델은 보통 몇 초 안에 응답)
    const PER_CALL_MS = 12000;
    const TOTAL_BUDGET_MS = 45000;
    const started = Date.now();
    let ok: Response | null = null;
    let lastStatus = 0;
    let lastDetail = "no response";
    for (const model of MODELS) {
      if (Date.now() - started > TOTAL_BUDGET_MS) break; // 시간 상한 초과 → 중단
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PER_CALL_MS);
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: reqBody, signal: ctrl.signal }
        );
        clearTimeout(timer);
        if (resp.ok) { ok = resp; break; }
        lastStatus = resp.status;
        lastDetail = `${model}:${resp.status} ${(await resp.text()).slice(0, 120)}`;
        // 429(한도)·503(과부하)·404 등 → 재시도 없이 바로 다음 모델(시간 절약)
      } catch {
        clearTimeout(timer);
        lastDetail = `${model}: timeout/err`; // 타임아웃·네트워크 → 다음 모델
      }
    }

    if (!ok) {
      // 모든 모델 실패. 429가 섞여 있으면(= 전부 한도) 사용자에게 명확히 안내.
      const quota = lastStatus === 429;
      return NextResponse.json(
        { error: quota ? "AI 사용량(무료 한도)이 초과되었습니다. 잠시 후 다시 시도해 주세요." : `AI 호출 실패(${lastStatus || 502})`, code: quota ? "quota" : undefined, detail: lastDetail },
        { status: quota ? 429 : 502 }
      );
    }

    const json = await ok.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

    let name = "";
    let box: number[] | null = null;
    let card: number[] | null = null;
    let rotation = 0;
    let birth6 = "";
    let rrn = "";
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.name === "string") name = parsed.name.replace(/\s/g, "");
      if (typeof parsed?.birth6 === "string") birth6 = parsed.birth6.replace(/\D/g, "").slice(0, 6);
      if (typeof parsed?.rrn === "string") {
        const d = parsed.rrn.replace(/\D/g, "");
        if (d.length === 13) rrn = d; // 13자리만 신뢰(부정확한 뒷자리 프리필 방지)
      }
      if (rrn) birth6 = rrn.slice(0, 6); // 둘 일치 보장
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

    const nm = name.match(/[가-힣]{2,5}/);
    name = nm ? nm[0] : "";
    return NextResponse.json({ name, birth6, rrn, box, card, rotation });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
