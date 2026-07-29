# 장사 방향 코치

전자책 구매 인증을 마친 소상공인이 매장 숫자를 바탕으로 목표 매출까지 필요한 고객 규모와 오늘 실행할 행동 한 가지를 확인하는 도구입니다. 결과는 매출을 보장하는 예측이 아니라, 확인된 수치와 다음 측정 행동을 연결하는 코칭 안내입니다.

첫 버전에는 전자책 본문 열람, 결제, 관리자 대시보드, 여러 매장 관리, 업종 평균 비교, 광고·POS 자동 수집, AI 자유 대화가 포함되지 않습니다.

## 시작하기

Node.js 24와 pnpm 11.9.0을 사용합니다.

```bash
pnpm install
pnpm dev
pnpm verify
```

`pnpm verify`는 서식, 타입 검사, 단위·계약 테스트, 비밀정보 노출 검사, 프로덕션 빌드를 차례로 실행합니다. `pnpm security:scan`만 별도로 실행할 수도 있습니다.

GitHub Actions CI는 `pnpm verify`와 Docker 기반 `database` 작업을 모두 실행합니다. `database` 작업은 Supabase CLI 2.109.1로 로컬 스택을 시작하고 마이그레이션 초기화, RLS pgTAP, Edge Function OPTIONS 스모크 테스트를 수행합니다. 어느 작업이든 실패하면 전체 CI가 실패하며, `main` 브랜치 보호 규칙에서는 이 Verify 워크플로를 필수 검사로 지정해야 합니다. 아래 명령은 같은 데이터베이스 검증을 로컬에서 재현할 때 사용합니다.

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

Supabase Dashboard의 **Authentication → URL Configuration**도 같은 운영 주소로 맞춥니다.

- **Site URL**: 운영 서비스의 기준 주소를 입력합니다. 예: `https://your-live-site.example`. 하위 경로 배포라면 `https://your-live-site.example/marketing`처럼 기준 경로까지 포함하고 끝의 `/`와 `?auth=callback`은 넣지 않습니다.
- **Redirect URLs**: 가입 Edge Function과 기존 로그인 링크가 보내는 콜백 주소를 허용합니다. 예: `https://your-live-site.example/?auth=callback`. 하위 경로 배포라면 `https://your-live-site.example/marketing/?auth=callback`도 별도로 추가합니다.

`SITE_URL` secret은 위 Site URL과 정확히 같은 운영 origin/base를 사용합니다. Edge Function은 `${SITE_URL}/?auth=callback`로, 브라우저 로그인은 현재 origin/base의 `?auth=callback`으로 돌아가므로 두 Redirect URL이 실제 배포 경로와 일치해야 합니다.

### 첫 초대 코드 만들기

초대 코드와 pepper는 로컬에서만 입력하고, 결과 해시만 인증된 관리자 SQL 세션에 넣습니다. 실제 코드나 pepper를 터미널 기록, 문서, 저장소에 적지 마세요.

```bash
read -rs INVITE_CODE
read -rs INVITE_HASH_PEPPER
INVITE_CODE_NORMALIZED="$(printf '%s' "${INVITE_CODE}" | node -e "let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(value.trim().toUpperCase()))")"
printf '%s' "${INVITE_HASH_PEPPER}${INVITE_CODE_NORMALIZED}" | openssl dgst -sha256 -r
unset INVITE_CODE INVITE_CODE_NORMALIZED INVITE_HASH_PEPPER
```

Edge Function도 초대 코드의 앞뒤 공백을 제거하고 대문자로 바꾼 뒤 해시합니다. 소문자·혼합 대소문자 또는 앞뒤 공백이 있는 원문을 정규화 없이 해시하면 해시가 일치하지 않아 사용할 수 없습니다.

출력된 해시를 복사해 Supabase SQL Editor 또는 인증된 `psql` 세션에서만 사용합니다.

```sql
insert into public.invite_codes (code_hash, status, expires_at)
values ('<paste-local-sha256-hash>', 'available', now() + interval '30 days');
```

## 즉시 코칭 운영

### 데이터베이스 마이그레이션

즉시 코칭을 켜기 전에 아래 두 마이그레이션을 순서대로 적용해야 합니다.

- `202607200010_instant_coaching.sql`: 코칭 세션·메시지·추천·요청 제한 테이블과 RLS를 만듭니다.
- `202607200011_coaching_atomic_transitions.sql`: 후속 질문 발행·응답·최종 추천 저장을 원자적으로 처리합니다.

운영 반영 전에는 `supabase link`가 가리키는 프로젝트 ref를 대시보드와 대조하고, `pnpm exec supabase migration list --linked`로 현재 상태를 확인합니다. 이어서 `pnpm exec supabase db push --linked --dry-run` 결과가 위 두 파일만 포함하는지 검토한 뒤 `pnpm exec supabase db push --linked`로 적용하고 migration list를 다시 확인합니다. 예상하지 않은 프로젝트나 SQL이 보이면 적용하지 않습니다.

마이그레이션 후에는 서로 다른 두 테스트 사용자로 본인 코칭 행만 읽히는지, `anon`과 `authenticated` 브라우저 역할로는 코칭 테이블에 직접 쓰지 못하는지 확인합니다. 서비스 역할은 `/api/coaching` 서버 함수에서만 사용합니다.

### Vercel 환경 변수와 배포 범위

라이브 브라우저 빌드에는 다음 세 공개 변수가 필요합니다. 세 변수 모두 Vercel의 **Preview**와 **Production** 범위에 설정하고, `VITE_APP_MODE` 값은 `live`로 둡니다.

- `VITE_APP_MODE=live`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

아래 네 변수는 공개 변수와 분리된 서버 전용 설정입니다.

서버 함수에는 다음 네 변수가 필요합니다. 값은 Vercel 환경 변수에만 저장하고 저장소, 브라우저 번들, 빌드 로그에 남기지 않습니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_COACHING_MODEL`

서버 전용 네 변수도 Vercel의 **Preview**와 **Production** 범위에 각각 존재해야 합니다. Preview에는 가능하면 별도 테스트 데이터 경계를 사용합니다. 브라우저에 공개할 수 있는 설정은 위의 `VITE_APP_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`뿐이며, 서비스 역할 키나 OpenAI 키 이름에 `VITE_` 접두사를 붙이지 않습니다. 변수를 추가하거나 바꾸면 기존 배포에는 반영되지 않으므로 새 Preview를 만든 뒤 검증하고, 같은 검증된 아티팩트를 Production으로 승격합니다.

### 관리자 대시보드 운영

관리자 대시보드는 조회 전용입니다. 회원 정보, 진단 요약, 중복 후보, 집계는 확인할 수 있지만 회원 수정·삭제·병합·내보내기와 코칭 대화 내용 조회는 제공하지 않습니다.

Vercel의 **Preview**와 **Production**에 아래 두 서버 전용 변수를 각각 설정합니다. 값은 저장소, 브라우저 변수, 빌드 출력, 로그에 넣지 않습니다.

```text
ADMIN_DASHBOARD_PASSWORD=<a unique long password kept outside the repository>
ADMIN_SESSION_SECRET=<at least 32 random bytes, independently generated>
```

일반 로고/이름 클릭의 기존 이동 동작은 그대로입니다. 같은 로고를 5초 안에 10번 누르면 비밀번호 대화상자가 열립니다. 인증 세션은 정확히 2시간 후 만료됩니다. 로그아웃하면 관리자 화면의 개인정보를 즉시 지우고 다시 인증해야 합니다.

`ADMIN_DASHBOARD_PASSWORD`를 교체하면 이후 로그인에는 새 비밀번호가 필요합니다. 이미 발급된 세션을 즉시 무효화해야 하면 독립적으로 `ADMIN_SESSION_SECRET`도 교체하고 새 Preview에서 확인한 뒤 Production에 반영합니다. 이 경우 기존 세션은 다시 인증해야 합니다.

중복 배지는 정규화한 이메일이 같은 경우 **높음**, 정규화한 지역과 상호가 같은 경우 **검토**를 뜻합니다. 배지는 중복 후보를 보여 주는 표시이며 회원 데이터를 변경하지 않습니다.

안전한 운영 반영 순서는 전체 브랜치 검토 → 두 서버 전용 변수의 Preview 설정 및 확인 → 같은 변수의 Production 설정 → `main` 병합 → `202607280012_admin_login_rate_limit.sql` 적용 → 검증된 빌드 배포 → 데스크톱·모바일 인증/로그아웃 및 읽기 전용 확인입니다. 실제 운영 비밀번호나 세션 비밀값은 이 문서와 배포 기록에 남기지 않습니다.

### 사용 제한과 안전한 응답

- 인증된 활성 사용자 한 명당 최근 1시간에 코칭 요청을 최대 20회 허용하며, 초과 요청은 HTTP 429를 반환합니다.
- 자유 입력과 후속 답변은 공백을 제거한 뒤 1~500자만 받습니다. 화면과 서버가 모두 500자 제한을 검증합니다.
- 후속 질문은 화면에 한 번에 하나만 표시하고 세션당 최대 두 번만 허용합니다.
- OpenAI 제공자가 실패하거나 구성되지 않아도 승인된 행동 카탈로그의 템플릿 답변을 반환합니다. 템플릿도 같은 안전·근거 규칙을 따릅니다.
- 이름, 이메일, 전화번호, 초대 코드 같은 개인정보는 모델 입력과 추천 기록에서 제외합니다. 코칭은 고객 이메일·전화번호를 묻거나 연락을 지시하지 않으며, 무단 연락·개인정보 수집 요청은 안전한 대안으로 전환합니다.

### 공식 콘텐츠 검토

`evidenceLevel: "official"`인 행동은 담당 운영자가 원문 공식 출처를 다시 확인한 뒤 `verifiedAt`을 갱신합니다. `reviewAfter`가 되기 전, 또는 정책·플랫폼 동작이 바뀌었을 때 즉시 재검토하고, 내용 변경 시 `version`을 올립니다. 검토 PR에는 출처, 확인일, 변경 이유를 기록하고 `pnpm verify`를 통과시킵니다. 출처를 확인할 수 없는 행동은 공식으로 표시하지 않고 가설 또는 원칙 수준으로 낮춥니다.

### 배포와 롤백

배포는 새 Preview 생성 → 인증·진단 게이트·코칭·피드백·모바일/PC 확인 → Preview 로그의 오류와 개인정보 노출 확인 → 검증된 Preview를 Production으로 승격하는 순서로 진행합니다. 승격 전에 직전 Production 배포 URL과 배포 ID를 기록해 즉시 `vercel rollback` 또는 해당 배포로 되돌릴 수 있게 둡니다.

문제가 서버 함수에 있으면 먼저 직전 Vercel 배포로 롤백하거나 `/api/coaching` 엔드포인트를 비활성화해 새 쓰기를 막습니다. 데이터베이스 롤백은 엔드포인트 비활성화와 데이터 보존 확인 뒤에만 진행하며, 코칭 테이블을 바로 삭제하지 않습니다. 마이그레이션 되돌림이 필요하면 별도의 검토된 전진 마이그레이션을 사용합니다.

## 출시 전 확인

운영 사용자 데이터(개인정보·매장 데이터·동의 기록)를 수집하기 전에는 개인정보 처리 목적, 보관 기간, 접근 권한, 동의 문구를 포함한 별도 개인정보 검토와 법률·보안 승인을 완료해야 합니다.
