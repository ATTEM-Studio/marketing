# 장사 방향 코치

전자책 구매 인증을 마친 소상공인이 매장 숫자를 바탕으로 목표 매출까지 필요한 고객 규모와 오늘 실행할 행동 두 가지를 확인하는 도구입니다. 결과는 매출을 보장하는 예측이 아니라, 확인된 수치와 다음 측정 행동을 연결하는 코칭 안내입니다.

첫 버전에는 전자책 본문 열람, 결제, 관리자 대시보드, 여러 매장 관리, 업종 평균 비교, 광고·POS 자동 수집, AI 자유 대화가 포함되지 않습니다.

## 시작하기

Node.js 24와 pnpm 11.9.0을 사용합니다.

```bash
pnpm install
pnpm dev
pnpm verify
```

`pnpm verify`는 서식, 타입 검사, 단위·계약 테스트, 비밀정보 노출 검사, 프로덕션 빌드를 차례로 실행합니다. `pnpm security:scan`만 별도로 실행할 수도 있습니다.

GitHub Actions CI도 같은 `pnpm verify`를 실행합니다. 데이터베이스 마이그레이션·RLS의 pgTAP 검증과 Edge Function 실행 확인은 Docker 기반 Supabase 로컬 스택이 필요하므로, 아래 운영 절차를 릴리스 전 별도로 실행합니다.

### 공개 데모

GitHub Pages 배포는 항상 `VITE_APP_MODE=demo`로 빌드합니다. 데모는 합성 데이터만 사용하며, 이름·이메일·초대 코드 등의 실제 등록 정보를 수집하거나 저장하지 않습니다. Supabase 설정이 없는 공개 정적 페이지에서 실사용 인증을 켜면 보안 경계를 보장할 수 없으므로, Pages에서는 라이브 인증을 제공하지 않습니다.

`main`에 푸시하거나 GitHub Actions에서 수동 실행하면 Pages 워크플로가 `dist/` 아티팩트를 배포합니다. 저장소가 `marketing`이면 Vite의 Pages 기준 경로는 `/marketing/`입니다.

## 라이브 Supabase 운영

로컬 검증에는 Docker와 Supabase CLI가 필요합니다.

```bash
pnpm exec supabase start
pnpm exec supabase db reset
pnpm exec supabase test db
```

운영 프로젝트를 만든 뒤 인증된 운영자만 다음 순서로 진행합니다.

```bash
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
pnpm exec supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY='<set-in-supabase-dashboard>' \
  INVITE_HASH_PEPPER='<generate-and-store-securely>' \
  SITE_URL='https://your-live-site.example' \
  ALLOWED_ORIGIN='https://your-live-site.example'
pnpm exec supabase functions deploy redeem-invite
pnpm exec supabase functions deploy finalize-registration
```

`SUPABASE_SERVICE_ROLE_KEY`, `INVITE_HASH_PEPPER`, `SITE_URL`, `ALLOWED_ORIGIN`은 Supabase Edge Function secrets에만 둡니다. 저장소, GitHub Pages, 브라우저 번들, `.env.example`에 넣지 않습니다. 브라우저에서 허용되는 변수는 `VITE_SUPABASE_URL`과 공개 가능한 `VITE_SUPABASE_ANON_KEY`뿐입니다.

### 첫 초대 코드 만들기

초대 코드와 pepper는 로컬에서만 입력하고, 결과 해시만 인증된 관리자 SQL 세션에 넣습니다. 실제 코드나 pepper를 터미널 기록, 문서, 저장소에 적지 마세요.

```bash
read -rs INVITE_CODE
read -rs INVITE_HASH_PEPPER
printf '%s' "${INVITE_HASH_PEPPER}${INVITE_CODE}" | openssl dgst -sha256 -r
unset INVITE_CODE INVITE_HASH_PEPPER
```

출력된 해시를 복사해 Supabase SQL Editor 또는 인증된 `psql` 세션에서만 사용합니다.

```sql
insert into public.invite_codes (code_hash, status, expires_at)
values ('<paste-local-sha256-hash>', 'unused', now() + interval '30 days');
```

## 출시 전 확인

운영 사용자 데이터(개인정보·매장 데이터·동의 기록)를 수집하기 전에는 개인정보 처리 목적, 보관 기간, 접근 권한, 동의 문구를 포함한 별도 개인정보 검토와 법률·보안 승인을 완료해야 합니다.
