# SQLite/API 전환 구현 가이드

## 목적

현재 `src/app/page.tsx`의 mock 상태 기반 화면을 SQLite 저장소와 Next.js App Router Route Handler API로 연결한다. 이 문서는 구현 전에 따라야 할 순서, 파일 구조, 데이터 모델, API, 보안, Docker 운영 기준을 고정한다.

코드 작성 전에는 `node_modules/next/dist/docs/`의 관련 문서를 다시 확인한다. 특히 App Router Route Handler, 환경변수, 인증, 데이터 보안 문서를 우선 확인한다.

## 현재 상태

- UI는 단일 클라이언트 컴포넌트 `src/app/page.tsx`에서 mock 데이터와 로컬 상태로 동작한다.
- QR 카메라 스캔은 브라우저 `getUserMedia`와 `BarcodeDetector` 기반으로 클라이언트에서 유지한다.
- 태그는 화면상 관리 UI가 있지만 아직 DB 저장은 없다.
- 의존성은 구현을 위해 추가되어 있다:
  - runtime: `better-sqlite3`, `drizzle-orm`, `zod`, `bcryptjs`
  - dev: `drizzle-kit`, `@types/better-sqlite3`

## 구현 순서

1. 서버 전용 DB 계층을 만든다.
   - `src/server/db/` 아래에 SQLite 연결, schema, migration/bootstrap, repository를 둔다.
   - DB 파일 경로는 `MATTER_SQLITE_PATH`에서 읽는다.
   - development fallback은 `./data/dev.sqlite`로 둔다.
   - production에서는 `MATTER_SQLITE_PATH`, `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`가 없으면 명확히 실패시킨다.
2. 인증 계층을 만든다.
   - 최초 사용자 없음 상태에서 환경변수의 관리자 계정을 생성한다.
   - 비밀번호는 bcrypt hash로 저장한다.
   - 로그인 성공 시 랜덤 session token을 발급하고 DB에는 HMAC 또는 hash된 세션 값만 저장한다.
   - 쿠키는 `HttpOnly`, `SameSite=Strict`, production에서 `Secure`로 설정한다.
3. API Route Handler를 만든다.
   - `/api/auth/*`, `/api/devices*`, `/api/tags*`, `/api/locations*`, `/api/export`를 구현한다.
   - 모든 devices/tags/locations/export API는 세션 검증을 먼저 수행한다.
   - 입력은 zod로 검증한다.
4. UI를 API 기반으로 전환한다.
   - mock 배열 초기값을 제거하고, 로그인 후 API에서 devices/tags/session을 가져온다.
   - 생성/수정/삭제 후에는 해당 목록을 재조회한다.
   - QR 스캔은 계속 클라이언트에서 수행하고, 스캔 결과를 device create/update payload에 포함한다.
5. Docker 운영 저장소를 반영한다.
   - Docker runner에서 `/data`를 만들고 `nextjs` 사용자가 쓸 수 있게 한다.
   - 운영 예시는 `MATTER_SQLITE_PATH=/data/matter-code-collector.sqlite`로 둔다.

## 데이터 모델

### users

- `id`: text primary key
- `username`: text unique not null
- `passwordHash`: text not null
- `role`: text not null, 기본 `admin`
- `createdAt`: integer unix epoch milliseconds
- `lastLoginAt`: integer nullable

### sessions

- `id`: text primary key
- `userId`: text not null, users 참조
- `tokenHash`: text unique not null
- `createdAt`: integer unix epoch milliseconds
- `expiresAt`: integer unix epoch milliseconds

### devices

- `id`: text primary key
- `alias`: text not null
- `deviceName`: text nullable
- `qrPayload`: text not null unique
- `numericCode`: text not null unique
- `manufacturer`: text nullable
- `model`: text nullable
- `location`: text nullable
- `notes`: text nullable
- `createdAt`: integer unix epoch milliseconds
- `updatedAt`: integer unix epoch milliseconds

### tags

- `id`: text primary key
- `name`: text unique not null
- `createdAt`: integer unix epoch milliseconds
- `updatedAt`: integer unix epoch milliseconds

### locations

- `id`: text primary key
- `name`: text unique not null
- `createdAt`: integer unix epoch milliseconds
- `updatedAt`: integer unix epoch milliseconds

위치 이름 변경은 `locations.name`을 바꾸고, 같은 이름을 쓰는 `devices.location`도 함께 갱신한다. 위치 삭제 시 연결된 기기의 `devices.location`은 빈 값으로 비운다.

### device_tags

- `deviceId`: text not null, devices 참조
- `tagId`: text not null, tags 참조
- primary key: `(deviceId, tagId)`

태그 이름 변경은 `tags.name`만 바꾸고, 바인딩은 `device_tags`로 유지한다. 태그 삭제 시 관련 `device_tags`도 함께 삭제한다.

## API 설계

### Auth

- `POST /api/auth/login`
  - body: `{ username, password }`
  - success: `{ user: { id, username, role } }`
  - failure: 401 with generic message
- `POST /api/auth/logout`
  - 현재 세션 삭제 및 쿠키 제거
- `GET /api/auth/session`
  - 로그인 상태면 `{ user }`
  - 비로그인이면 401

### Devices

- `GET /api/devices`
  - query: `q`, `location`, `tagId`, `sort`
  - response: `{ devices }`
- `POST /api/devices`
  - body: device fields + `tagIds`
  - 중복 `qrPayload` 또는 `numericCode`는 409
- `GET /api/devices/[id]`
  - 단일 device detail
- `PATCH /api/devices/[id]`
  - body: partial device fields + optional `tagIds`
  - 중복은 409
- `DELETE /api/devices/[id]`
  - device와 바인딩 삭제

### Tags

- `GET /api/tags`
  - response: `{ tags }`
- `POST /api/tags`
  - body: `{ name }`
  - 중복 이름은 409
- `PATCH /api/tags/[id]`
  - body: `{ name }`
  - 중복 이름은 409
- `DELETE /api/tags/[id]`
  - tag와 device 바인딩 삭제

### Locations

- `GET /api/locations`
  - response: `{ locations }`
- `POST /api/locations`
  - body: `{ name }`
  - 중복 이름은 409
- `PATCH /api/locations/[id]`
  - body: `{ name }`
  - 중복 이름은 409
- `DELETE /api/locations/[id]`
  - location 삭제 후 해당 위치를 쓰던 device의 `location` 비움

### Export

- `GET /api/export?format=json`
  - 전체 devices/tags 데이터를 JSON으로 반환
- `GET /api/export?format=csv`
  - devices 중심 CSV 반환

Export도 로그인 세션이 필요하다. 비밀번호 해시와 세션 정보는 절대 포함하지 않는다.

## UI 전환 기준

- 로그인 화면은 `/api/auth/login`을 호출하고 성공 시 목록 화면으로 전환한다.
- 앱 최초 로딩 시 `/api/auth/session`을 호출한다.
- 로그인 상태면 `/api/devices`, `/api/tags`를 호출한다.
- 목록 필터는 v1에서 클라이언트 필터를 유지해도 되지만, API query도 받을 수 있게 둔다.
- 태그 관리는 `/api/tags`를 통해 추가/수정/삭제한다.
- 위치 관리는 `/api/locations`를 통해 추가/수정/삭제한다.
- 기기 등록/수정 폼의 태그 바인딩은 `tagIds` 배열로 전송한다.
- 생성/수정/삭제 후에는 devices/tags를 재조회한다.
- optimistic update는 v1에서 사용하지 않는다.
- QR 코드 표시와 카메라 스캔은 클라이언트 UI에서 유지한다.

## 보안 기준

- 서버 전용 코드는 클라이언트 컴포넌트에서 import하지 않는다.
- 환경변수는 서버 계층에서만 읽는다.
- `AUTH_SECRET`은 세션 토큰 hash/HMAC에 사용한다.
- production에서 `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MATTER_SQLITE_PATH` 누락 시 앱이 명확한 오류로 실패해야 한다.
- `MATTER_COOKIE_TRANSPORT=https-only`는 production 세션 쿠키에 `Secure`를 붙여 HTTPS에서만 로그인 세션을 허용한다.
- `MATTER_COOKIE_TRANSPORT=http-and-https`는 production 세션 쿠키의 `Secure`를 끄고 HTTP와 HTTPS 모두에서 로그인 세션을 허용한다. 개인 내부망용 예외이며, 카메라 스캔은 브라우저 정책상 여전히 HTTPS 또는 localhost가 필요하다.
- 로그인 실패 메시지는 계정 존재 여부를 드러내지 않는다.
- 모든 mutation API는 세션 검증 후 입력 검증을 수행한다.
- 모든 DB 쿼리는 Drizzle query builder 또는 parameterized query를 사용한다.
- 응답 DTO에는 `passwordHash`, `tokenHash` 등 내부 필드를 포함하지 않는다.
- 세션 만료 시간은 기본 7일로 둔다.

## 환경변수

개발 예시:

```env
MATTER_SQLITE_PATH=./data/dev.sqlite
AUTH_SECRET=replace-with-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
MATTER_COOKIE_TRANSPORT=https-only
```

Docker 운영 예시:

```env
MATTER_SQLITE_PATH=/data/matter-code-collector.sqlite
AUTH_SECRET=replace-with-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-before-first-run
MATTER_COOKIE_TRANSPORT=https-only
```

`.env*` 파일은 프로젝트 루트에만 둔다. `/src` 내부에 두지 않는다.

## Docker 기준

- runner stage에서 `/data` 디렉터리를 생성한다.
- `/data`는 `nextjs` 사용자가 쓰기 가능해야 한다.
- 운영 실행 예시:

```bash
docker run \
  -p 3000:3000 \
  -v matter-code-data:/data \
  --env-file .env.production.local \
  matter-code-collector
```

컨테이너 재생성 후에도 `/data/matter-code-collector.sqlite`가 보존되어야 한다.

## 검증 시나리오

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- API 수동 검증:
  - 비로그인 상태에서 `/api/devices`, `/api/tags`, `/api/export`가 401을 반환한다.
  - 관리자 로그인 성공 시 HttpOnly 세션 쿠키가 설정된다.
  - 잘못된 로그인은 401과 일반 오류 메시지를 반환한다.
  - 태그 추가/수정/삭제가 DB와 UI에 반영된다.
  - 기기 등록/수정/삭제가 DB와 UI에 반영된다.
  - QR/numericCode 중복 등록은 409를 반환한다.
  - JSON/CSV export는 로그인 상태에서만 동작한다.
- Docker 검증:
  - `/data` volume을 붙여 실행한다.
  - 기기를 등록한 뒤 컨테이너를 재시작해도 데이터가 남아 있다.

## 구현 중 주의사항

- mock UI가 커졌으므로, API 전환 중 필요한 경우 `src/app/page.tsx`를 작은 client components로 분리한다.
- 단, 첫 구현에서는 동작 안정성을 우선하고 과한 추상화는 피한다.
- Drizzle migration 파일을 생성할 경우 DB 파일과 migration 산출물을 구분한다.
- SQLite DB 파일과 `.env*`는 git에 포함하지 않는다.
