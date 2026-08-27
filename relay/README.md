# Leafmark NVIDIA relay

NVIDIA's hosted NIM API does not accept credentialed browser requests from GitHub Pages. This narrowly scoped Cloudflare Worker supplies the missing CORS boundary.

It accepts only `GET /v1/models` and `POST /v1/chat/completions`, only from the configured Leafmark origins, and only with the reader's bearer key. It holds each bounded request only long enough to forward it, then streams NVIDIA's response back to the browser. It has no database, cache, analytics code, application secret, or request logging.

## Local development

```bash
npm run relay:dev
```

The local relay is available at `http://localhost:8787`. Start Leafmark with `NEXT_PUBLIC_LEAFMARK_NVIDIA_RELAY_URL=http://localhost:8787/v1` to expose the first-class NVIDIA form locally.

## Deployment

```bash
npm run relay:dry-run
npm run relay:deploy
```

After deployment, set the GitHub repository variable `NVIDIA_RELAY_URL` to the Worker URL ending in `/v1`. The Pages workflow injects that public URL into the static build. Do not put an NVIDIA API key in Worker configuration; each reader supplies their own temporary key.
