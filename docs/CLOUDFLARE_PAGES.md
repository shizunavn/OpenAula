# Triển khai OpenAula trên Cloudflare (Workers + Static Assets)

Dự án triển khai dưới dạng **Cloudflare Worker kèm static assets**, không dùng các file đặc thù của Cloudflare Pages.
Lỗi `Pages _routes.json is not supported` xuất hiện khi `_routes.json` / `_worker.js` / `functions/` (chỉ dành cho Pages) bị đưa vào bản triển khai Workers.

## Cấu trúc

```
wrangler.jsonc        # main = worker/index.js, assets = ./dist
worker/
  index.js            # Chỉ chạy cho /api/* (assets.run_worker_first)
  region.js           # /api/region  (VN -> 'vi', khác -> 'en')
  health.js           # /api/health
public/
  _headers            # Permissions-Policy (WebHID) + cache cho /assets/*
  .assetsignore       # Loại _worker.js, _routes.json, _redirects khỏi bản upload
```

- SPA fallback do `assets.not_found_handling = "single-page-application"` xử lý, **không** dùng `_redirects` (`/* /index.html 200` không được hỗ trợ trên Workers).
- `_headers` chỉ áp dụng cho file tĩnh; response của Worker tự đặt header trong code.
- Không còn `functions/`, `_routes.json`, `_worker.js`, `wrangler.toml`, `pages_build_output_dir`.

## Deploy lên Pages (open-hero68.pages.dev)

```bash
npx wrangler login
npm run pages:deploy   # build + wrangler pages deploy dist --project-name open-hero68
```

`functions/api/*` là wrapper gọi code trong `worker/`; Pages tự sinh `_routes.json`, **không** tự tạo file này. Không có `_redirects` vì Pages tự fallback về `index.html`.

## Chạy thử cục bộ

```bash
npm ci
npm run dev          # Vite dev server (HTTPS, WebHID)
npm run cf:dev       # build + mô phỏng Worker + assets (http://localhost:8787)
```

Kiểm tra: `/`, `/api/region`, `/api/health`.

## Triển khai

**Git (Workers Builds)**: Build command `npm run build`, Deploy command `npx wrangler deploy`, biến môi trường `NODE_VERSION=22.12.0`.

**CLI**:
```bash
npm run cf:deploy    # build + wrangler deploy
```

## Lưu ý

- Nếu dự án cũ của bạn là Pages (`*.pages.dev`), hãy tạo Worker mới (hoặc dùng "Migrate to Workers") rồi trỏ domain sang Worker. Origin `https://open-hero68.pages.dev` vẫn được Windows service chấp nhận; nếu đổi sang `*.workers.dev` hoặc domain riêng, hãy thêm origin đó vào biến môi trường `HERO68_ALLOWED_ORIGINS` của Windows service.
