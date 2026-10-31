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
  "rrn = 주민등록번호 전체 13자리(생년월일 앞6 + 하이픈 뒤7) 숫자만, 하이픈 없이. 한국 주민등록증·운전면허증에는 13자리가 모두 인쇄돼 있다. 하이픈 뒤 7자리는 글자가 작으니 확대해서라도 한 자리씩 끝까지 또렷이 판독해 반드시 채운다(대충 6자리만 넣지 말 것). 정말로 일부가 가려졌거나 물리적으로 판독 불가할 때만 빈 문자열. rrn이 비어도 name·birth6·box·card·rotation은 반드시 채운다. " +
  "box = 증명사진 속 사람의 얼굴(머리~턱, face) 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 여백 말고 얼굴에 밀착. 얼굴을 못 찾으면 null. " +
  "card = 신분증 카드/문서 전체 영역만 딱 맞게 감싼 경계 상자를 (지금 보이는 이미지 기준) 0~1000으로 정규화한 정수 좌표. 주변 배경(책상/손/그림자 등)은 제외하고 신분증 테두리에 밀착. 신분증 경계를 못 찾으면 null. " +
  "rotation = 증명사진 속 사람의 얼굴이 똑바로 보이도록(두 눈이 위, 코가 가운데, 입이 아래) 이 이미지를 시계방향으로 회전해야 하는 각도. 0, 90, 180, 270 중 하나. 얼굴이 이미 똑바르면 0. 얼굴이 거꾸로면 180.";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OCR 미설정(GEMINI_API_KEY 없음)" }, { status: 501 });
  }

  // 진단: ?models=1 → 이 키로 generateContent 가능한 모델 목록(이미지 불필요).
  if (new URL(req.url).searchParams.get("models") === "1") {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`);
      const j = await r.json();
      const names = (j?.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: { name?: string }) => (m.name ?? "").replace("models/", ""));
      return NextResponse.json({ status: r.status, models: names });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
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
  //  · gemini-2.5-flash/-lite는 구글이 신규 사용자에게 폐기(404) → 체인에서 제거(헛호출 방지).
  //  · lite 계열은 thinkingConfig를 거부(400 invalid argument)하므로 body에서 뺀다(모델별 분기).
  //  · 3.x flash가 전면 과부하(503)일 때 과부하가 덜한 lite로라도 넘어가도록 폴백에 포함.
  const envModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const MODELS = [...new Set([
    envModel,
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
  ])];
  const isLite = (m: string) => m.includes("lite");
  const buildBody = (useThinking: boolean) =>
    JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
        ...(useThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        responseMimeType: "application/json",
      },
    });
  // lite 모델은 thinkingConfig 미지원 → 빼고 호출. 나머지는 thinkingBudget:0(사고 비활성, 빠름).
  const bodyFor = (m: string) => buildBody(!isLite(m));

  // 진단: ?probe=1 → 각 모델을 한 번씩(최대 20s) 호출해 상태코드를 반환(어느 모델이 유효/가용한지 파악).
  if (new URL(req.url).searchParams.get("probe") === "1") {
    const listParam = new URL(req.url).searchParams.get("list");
    const probeModels = listParam ? listParam.split(",").map((s) => s.trim()).filter(Boolean) : MODELS;
    const forceNoThink = new URL(req.url).searchParams.get("nothink") === "1"; // thinkingConfig 제거 테스트용
    const out: { model: string; status: number | string; ms: number; detail?: string }[] = [];
    for (const model of probeModels) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const t0 = Date.now();
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: forceNoThink ? buildBody(false) : bodyFor(model), signal: ctrl.signal }
        );
        clearTimeout(timer);
        const detail = resp.ok ? undefined : (await resp.text()).slice(0, 160);
        out.push({ model, status: resp.status, ms: Date.now() - t0, detail });
      } catch {
        clearTimeout(timer);
        out.push({ model, status: "timeout", ms: Date.now() - t0 });
      }
    }
    return NextResponse.json({ probe: out });
  }

  try {
    // 느린/과부하 모델에 오래 매달리지 않도록 호출마다 타임아웃(12s) + 전체 상한(45s)을 둔다.
    // (쿼터 소진 모델은 빠르게 429로 떨어지고, 건강한 모델은 보통 몇 초 안에 응답)
    const PER_CALL_MS = 12000;
    const TOTAL_BUDGET_MS = 45000;
    const started = Date.now();
    type Parsed = { name: string; birth6: string; rrn: string; box: number[] | null; card: number[] | null; rotation: number };
    const parseOut = (json: unknown): Parsed => {
      const text: string =
        (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
          ?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      let name = "", birth6 = "", rrn = "", rotation = 0;
      let box: number[] | null = null, card: number[] | null = null;
      try {
        const p = JSON.parse(text) as Record<string, unknown>;
        if (typeof p?.name === "string") name = p.name.replace(/\s/g, "");
        if (typeof p?.birth6 === "string") birth6 = p.birth6.replace(/\D/g, "").slice(0, 6);
        if (typeof p?.rrn === "string") { const d = p.rrn.replace(/\D/g, ""); if (d.length === 13) rrn = d; }
        if (rrn) birth6 = rrn.slice(0, 6);
        if (Array.isArray(p?.box) && p.box.length === 4 && p.box.every((n) => typeof n === "number")) box = p.box as number[];
        if (Array.isArray(p?.card) && p.card.length === 4 && p.card.every((n) => typeof n === "number")) card = p.card as number[];
        if (typeof p?.rotation === "number") rotation = ((Math.round((p.rotation as number) / 90) * 90) % 360 + 360) % 360;
      } catch {
        const m = text.replace(/\s/g, "").match(/[가-힣]{2,5}/);
        name = m ? m[0] : "";
      }
      const nm = name.match(/[가-힣]{2,5}/);
      name = nm ? nm[0] : "";
      return { name, birth6, rrn, box, card, rotation };
    };

    let best: Parsed | null = null;    // 이름+주민번호(13) 모두 있는 최상 결과
    let partial: Parsed | null = null; // 이름만 있고 주민번호가 빈 결과(백업)
    let lastStatus = 0;
    let lastDetail = "no response";
    // 모델당 1회 호출. 단, 200이어도 주민번호(rrn)가 비면 거기서 끝내지 않고 다음 모델로 rrn 있는 응답을 더 찾는다.
    // (과부하 땐 모델이 이름·생년월일만 주고 rrn·box·card를 통째로 건너뛰는 일이 잦음 → 한 번의 OCR 요청으로 rrn까지 확보)
    for (const model of MODELS) {
      if (best) break;
      if (Date.now() - started > TOTAL_BUDGET_MS) break; // 시간 상한 초과 → 중단
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PER_CALL_MS);
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyFor(model), signal: ctrl.signal }
        );
        clearTimeout(timer);
        if (resp.ok) {
          const parsed = parseOut(await resp.json());
          if (parsed.name && parsed.rrn) { best = parsed; break; }  // 최상: 이름+주민번호 → 확정
          if (!partial || (parsed.name && !partial.name)) partial = parsed; // 백업 보관(이름 있는 쪽 우선)
          continue; // 주민번호 찾으러 다음 모델로
        }
        lastStatus = resp.status;
        lastDetail = `${model}:${resp.status} ${(await resp.text()).slice(0, 120)}`;
      } catch {
        clearTimeout(timer);
        lastDetail = `${model}: timeout/err`; // 타임아웃·네트워크
      }
    }

    const out = best ?? partial;
    if (!out) {
      // 모든 모델 실패. 429(한도)·503(과부하)를 구분해 사용자에게 명확히 안내.
      const quota = lastStatus === 429;
      const busy = lastStatus === 503;
      const msg = quota
        ? "AI 사용량(무료 한도)이 초과되었습니다. 잠시 후 다시 시도해 주세요."
        : busy
          ? "AI 서버가 혼잡(과부하)합니다. 잠시 후 다시 시도해 주세요."
          : `AI 호출 실패(${lastStatus || 502})`;
      return NextResponse.json(
        { error: msg, code: quota ? "quota" : busy ? "busy" : undefined, detail: lastDetail },
        { status: quota ? 429 : busy ? 503 : 502 }
      );
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
