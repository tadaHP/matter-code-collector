# matter-code-collector

Next.js App Router 기반 프로젝트입니다. 패키지 매니저는 `pnpm`을 사용합니다.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## Docker 배포

### docker-compose.yml 예시

```yaml
services:
  matter-code-collector:
    image: ghcr.io/<github-owner>/matter-code-collector:latest
    container_name: matter-code-collector
    ports:
      - '3000:3000'
    environment:
      MATTER_SQLITE_PATH: /data/matter-code-collector.sqlite
      AUTH_SECRET: replace-with-long-random-secret
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: change-me-before-first-run
      MATTER_COOKIE_TRANSPORT: https-only
    volumes:
      - matter-code-data:/data
    restart: unless-stopped

volumes:
  matter-code-data:
```

### 환경변수

- `MATTER_SQLITE_PATH`: SQLite DB 파일 경로입니다. Docker에서는 `/data/matter-code-collector.sqlite`처럼 volume 안의 경로를 사용합니다.
- `AUTH_SECRET`: 로그인 세션 토큰 서명에 쓰는 비밀값입니다. 운영 환경에서는 필수이며, 없으면 앱이 명확한 오류로 실패합니다.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`: DB에 사용자가 하나도 없을 때 최초 관리자 계정을 만들기 위해서만 사용합니다. 최초 실행 후 DB에 사용자가 생성되면 이 값을 제거해도 기존 계정으로 로그인할 수 있습니다.
- `MATTER_COOKIE_TRANSPORT`: 로그인 쿠키 전송 정책입니다.

`AUTH_SECRET`은 배포 전에 아래처럼 생성해 설정합니다.

```bash
openssl rand -base64 32
```

운영 중 `AUTH_SECRET`을 바꾸면 기존 로그인 세션은 무효화됩니다. 저장된 기기 데이터와 관리자 계정은 SQLite DB에 남아 있습니다.

`MATTER_COOKIE_TRANSPORT` 옵션:

| 값 | 동작 |
| --- | --- |
| `https-only` | production에서 세션 쿠키에 `Secure`를 붙입니다. HTTPS 접속에서만 로그인 세션을 유지합니다. 기본값입니다. |
| `http-and-https` | production에서도 세션 쿠키의 `Secure`를 끕니다. HTTP와 HTTPS 둘 다 로그인 세션을 유지합니다. 내부망 HTTP 배포용입니다. |

카메라 QR 스캔은 브라우저 정책상 `MATTER_COOKIE_TRANSPORT=http-and-https`에서도 HTTPS 또는 localhost가 필요할 수 있습니다.

### 이미지 빌드 순서

```bash
docker build -t matter-code-collector:latest .
docker run --rm -p 3000:3000 \
  -e MATTER_SQLITE_PATH=/data/matter-code-collector.sqlite \
  -e AUTH_SECRET=replace-with-long-random-secret \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=change-me-before-first-run \
  -e MATTER_COOKIE_TRANSPORT=http-and-https \
  -v matter-code-data:/data \
  matter-code-collector:latest
```

### GitHub Container Registry 업로드

```bash
export GITHUB_OWNER=<github-owner>
export IMAGE_NAME=matter-code-collector
export IMAGE_TAG=latest

echo <github-token> | docker login ghcr.io -u <github-username> --password-stdin
docker tag matter-code-collector:latest ghcr.io/$GITHUB_OWNER/$IMAGE_NAME:$IMAGE_TAG
docker push ghcr.io/$GITHUB_OWNER/$IMAGE_NAME:$IMAGE_TAG
```

업로드한 이미지는 compose 예시의 `image` 값을 `ghcr.io/$GITHUB_OWNER/$IMAGE_NAME:$IMAGE_TAG` 형식으로 맞춰 사용합니다.
