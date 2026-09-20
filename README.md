# 양압기 계약서류 웹앱

미사연세이비인후과에서 양압기 환자에게 필요한 5개 서류(신분증, 표준계약서, 급여대상자 등록 신청서, CMS 자동이체신청서, 요양비 지급청구 위임장)를 태블릿/폰 브라우저에서 작성·서명받고 환자별로 이력 관리하는 웹앱입니다.

## 처음 설정하기 (계정 생성은 직접 해주셔야 해요)

### 1. Supabase 프로젝트 만들기 (DB + 파일 저장소, 무료)

1. https://supabase.com 에서 회원가입 후 새 프로젝트 생성
2. 프로젝트가 만들어지면 왼쪽 메뉴 **SQL Editor** → New query 에 [`supabase/schema.sql`](./supabase/schema.sql) 내용을 그대로 붙여넣고 Run
   - `patients`, `documents` 테이블과 비공개 파일 저장 버킷(`patient-documents`)이 만들어집니다.
3. 왼쪽 메뉴 **Project Settings > API** 에서 다음 값을 복사해두세요.
   - `Project URL`
   - `service_role` 키 (⚠️ 절대 외부에 공유하지 마세요. 이 키가 있으면 DB 전체에 접근 가능합니다)

### 2. 로컬 환경변수 설정

`.env.local.example`을 복사해 `.env.local`을 만들고 직접 값을 채워주세요 (이 파일은 git에 올라가지 않습니다).

```bash
cp .env.local.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL`: 위에서 복사한 Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: 위에서 복사한 service_role 키
- `APP_PASSWORD`: 직원들이 로그인할 때 쓸 공유 비밀번호 (원하는 값으로 설정)
- `SESSION_SECRET`: 아무 긴 임의 문자열 (터미널에서 `openssl rand -base64 32` 실행해서 나온 값 사용 추천)

### 3. 로컬에서 실행

```bash
npm install
npm run dev
```

http://localhost:3000 접속 → 설정한 `APP_PASSWORD`로 로그인 → 환자 등록/서류 작성 테스트

### 4. 배포 (Vercel)

1. 터미널에서 `npx vercel login` 실행 (브라우저로 본인 계정 로그인)
2. 이 폴더에서 `npx vercel` 실행 → 프로젝트 연결
3. Vercel 대시보드 (또는 `npx vercel env add`) 에서 위 4개 환경변수를 **Production** 환경에 등록
4. `npx vercel --prod` 로 배포

## 서류 5종

| 서류 | 방식 |
|---|---|
| 신분증 | 폰 기본 스캔 기능으로 찍어둔 사진을 갤러리에서 선택해 업로드 |
| 표준계약서 | 원본 서식을 재현한 화면에 병원 입력 + 환자 서명(터치) |
| 급여대상자 등록 신청서 | 위와 동일 |
| CMS 자동이체신청서 | 위와 동일 |
| 요양비 지급청구 위임장 | 위와 동일 |

5개 서류가 모두 "완료" 상태가 되면 환자 목록 화면에서 진행 상태를 한눈에 확인할 수 있습니다.

## 구조

- `src/lib/templates/*.ts` — 4개 서식의 필드 정의 (라벨, 기본값, 입력 타입)
- `src/components/TemplateForm.tsx` — 서식을 렌더링하는 공용 컴포넌트 (작성=열람=인쇄 공용)
- `src/components/SignaturePad.tsx` — 손가락/펜 서명 캡처 (canvas)
- `src/components/IdCardUploader.tsx` — 신분증 이미지 업로드
- `src/app/api/**` — Supabase 접근은 전부 서버(API route)에서만 처리, 클라이언트는 service role 키를 절대 갖지 않음
- `src/proxy.ts` — 로그인 세션 쿠키 확인, 없으면 `/login`으로 리다이렉트

## 보안 메모

- 환자의 주민번호/계좌번호/신분증 이미지가 저장되는 앱입니다. `APP_PASSWORD`와 `SESSION_SECRET`은 추측하기 어려운 값으로 설정하고, 다른 사람과 공유하지 마세요.
- `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 환경변수와 로컬 `.env.local`에만 두고, 채팅이나 문서에 붙여넣지 마세요.
