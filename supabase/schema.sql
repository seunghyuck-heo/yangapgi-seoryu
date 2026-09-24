-- 양압기 서류계약 — 계정 기반 스키마 (Supabase Auth + RLS)
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run 하세요.
-- (계정은 Supabase Auth(이메일+비밀번호)로 관리되며, 각 계정은 자기 데이터만 접근합니다.)

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 프로필 (계정 이름 등 부가정보). auth.users 와 1:1
-- ────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  clinic text,
  updated_at timestamptz not null default now()
);

-- 회원가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 환자 (계정별 소유)
-- ────────────────────────────────────────────────────────────
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  resident_number text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists patients_owner_idx on patients(owner_id);

-- ────────────────────────────────────────────────────────────
-- 서류 (환자당 서류타입 1개, 계정별 소유)
-- ────────────────────────────────────────────────────────────
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  doc_type text not null check (doc_type in
    ('id_card', 'contract', 'subsidy_application', 'cms_autopay', 'power_of_attorney', 'care_card')),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  form_data jsonb not null default '{}'::jsonb,
  file_path text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (patient_id, doc_type)
);
create index if not exists documents_patient_id_idx on documents(patient_id);
create index if not exists documents_owner_idx on documents(owner_id);

-- ────────────────────────────────────────────────────────────
-- RLS: 각 계정은 자기 소유(owner_id = 로그인 사용자)만 접근
-- ────────────────────────────────────────────────────────────
alter table profiles  enable row level security;
alter table patients  enable row level security;
alter table documents enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own patients" on patients;
create policy "own patients" on patients
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own documents" on documents;
create policy "own documents" on documents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- Storage (신분증 이미지 / 서명 PNG) — 비공개 버킷
-- 경로 규칙: {owner_id}/{patient_id}/{파일명}
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

drop policy if exists "own files select" on storage.objects;
create policy "own files select" on storage.objects
  for select using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own files insert" on storage.objects;
create policy "own files insert" on storage.objects
  for insert with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own files update" on storage.objects;
create policy "own files update" on storage.objects
  for update using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own files delete" on storage.objects;
create policy "own files delete" on storage.objects
  for delete using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ────────────────────────────────────────────────────────────
-- [기존 DB 마이그레이션] 이미 documents 테이블이 있는 경우, 아래를 한 번 실행해
-- care_card(양압기 환자관리카드) 저장을 허용하세요. (신규 생성 시에는 위 정의에 이미 포함)
--   alter table documents drop constraint if exists documents_doc_type_check;
--   alter table documents add constraint documents_doc_type_check
--     check (doc_type in
--       ('id_card','contract','subsidy_application','cms_autopay','power_of_attorney','care_card'));
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 확장(대규모): 환자 목록 서버 페이지네이션/검색/총원 RPC
--  · '등록 환자' 판별: 서류 하나라도 완료 || (신분증 업로드/완료 + 이름 입력)
--  · security invoker → 호출자 권한으로 실행되어 RLS(owner_id=auth.uid())가 그대로 적용됨
--  · 성능: 아래 인덱스 권장
--      create index if not exists documents_patient_type_status_idx
--        on documents(patient_id, doc_type, status);
-- ────────────────────────────────────────────────────────────
create index if not exists documents_patient_type_status_idx
  on documents(patient_id, doc_type, status);

create or replace function public.is_registered_patient(p patients)
returns boolean language sql stable security invoker as $$
  select
    exists (select 1 from documents d where d.patient_id = p.id and d.status = 'completed')
    or (
      coalesce(nullif(btrim(p.name), ''), '') <> ''
      and btrim(p.name) <> '새 환자'
      and exists (
        select 1 from documents d
        where d.patient_id = p.id and d.doc_type = 'id_card'
          and (d.status = 'completed' or d.file_path is not null)
      )
    );
$$;

create or replace function public.list_registered_patients(
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns setof patients language sql stable security invoker as $$
  select p.*
  from patients p
  where p.owner_id = auth.uid()
    and (p_search is null or p.name ilike '%' || p_search || '%' or coalesce(p.phone,'') ilike '%' || p_search || '%')
    and public.is_registered_patient(p)
  order by p.updated_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

create or replace function public.count_registered_patients(
  p_search text default null
)
returns bigint language sql stable security invoker as $$
  select count(*)::bigint
  from patients p
  where p.owner_id = auth.uid()
    and (p_search is null or p.name ilike '%' || p_search || '%' or coalesce(p.phone,'') ilike '%' || p_search || '%')
    and public.is_registered_patient(p);
$$;
-- ────────────────────────────────────────────────────────────
