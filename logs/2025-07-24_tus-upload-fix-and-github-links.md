# 2025-07-24 — tus Upload Fix + GitHub/LinkedIn Links

## What was done

### tus Upload Fix
- **Root cause**: 8 simultaneous tus uploads with 5MB chunks created ~1,760 PATCH requests through Cloudflare, overwhelming the proxy and causing connection drops at ~950MB offset (`response code: n/a`)
- **Chunk size**: Increased `TUS_CHUNK_SIZE` from 5MB to 50MB (10x fewer HTTP round-trips per file)
- **Concurrent upload limit**: Added `MAX_CONCURRENT_UPLOADS = 2` — uploads now queue and process 2 at a time instead of all files simultaneously
- **Retry resilience**: Extended `retryDelays` from `[0, 1000, 3000, 5000]` to `[0, 1000, 3000, 5000, 10000, 30000]` (6 retries, up to 30s delay)
- **Bug fix**: `onUploadComplete` callback now fires after all uploads finish (success or error), fixing a bug where it never fired if any file errored

### GitHub + LinkedIn Links
- **Dashboard navbar**: Added GitHub icon (inline SVG) between Docs icon and theme toggle, linking to `https://github.com/Zaki-1052/cleave`
- **Landing page navbar**: Added GitHub icon between "Docs" nav link and "Launch Dashboard" button
- **Landing page footer**: Added "Built by Zakir Alibhai" (links to LinkedIn profile) and "Source" (links to GitHub repo) below the copyright line

## Decisions made
- Used inline SVG for GitHub icon instead of lucide-react (the installed version doesn't export a `Github` icon)
- 50MB chunk size chosen to stay well under Cloudflare free plan's 100MB per-request limit
- NGINX 600s timeout confirmed sufficient — each 50MB chunk completes in seconds even on slow connections

## Files modified
- `frontend/src/components/fastqs/FileUploadZone.tsx` — tus chunk size, concurrent upload queue
- `frontend/src/components/layout/Navbar.tsx` — GitHub icon link
- `frontend/src/pages/LandingPage.tsx` — GitHub icon in nav, footer attribution

## Open items
- Deploy: rebuild frontend on EC2 (`git pull && cd frontend && npm run build`)
