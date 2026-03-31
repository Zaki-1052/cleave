# Cleave — Production Update Guide

> How to deploy new features/fixes to the production EC2 instance.
> For initial deployment, see `DEPLOYMENT_GUIDE.md`.

---

## Quick Reference

```bash
# 1. Pull code
ssh -i ~/.ssh/210323.pem ubuntu@<ec2-public-dns>
cd /data2/cleave/app
git pull origin main

# 2. Backend
conda activate cleave
cd backend
pip install -e .
alembic upgrade head

# 3. Frontend (build locally, copy to EC2 — see below)

# 4. Restart
sudo systemctl restart cleave-api cleave-worker
```

---

## Step-by-Step

### 1. Pull the latest code (on EC2)

```bash
ssh -i ~/.ssh/210323.pem ubuntu@<ec2-public-dns>
cd /data2/cleave/app
git pull origin main
```

If you have local changes on the instance (you shouldn't), stash them first:

```bash
git stash
git pull origin main
git stash pop  # only if you need those changes back
```

### 2. Backend dependencies + migrations

Only needed if the update added new Python packages or database migrations. Safe to run every time (no-ops if nothing changed).

```bash
conda activate cleave
cd /data2/cleave/app/backend
pip install -e .
alembic upgrade head
```

**Check if migrations are needed:**

```bash
alembic current   # shows current revision
alembic heads     # shows latest revision
# If they match, no migration needed
```

### 3. Frontend build

The EC2 instance runs Ubuntu 18.04 (glibc 2.27) which **cannot run Node 18+**. You must build the frontend on your local Mac and copy the `dist/` folder to EC2.

```bash
# On your local Mac
cd /path/to/cleave/frontend
npm install       # only if dependencies changed (new packages in package.json)
npm run build     # builds to dist/

# Copy to EC2 (replaces existing dist/)
scp -i ~/.ssh/210323.pem -r dist/ ubuntu@<ec2-public-dns>:/data2/cleave/app/frontend/
```

**Verify on EC2:**

```bash
ls -la /data2/cleave/app/frontend/dist/index.html
ls /data2/cleave/app/frontend/dist/assets/  # should have .js and .css files
```

> NGINX serves files from `/data2/cleave/app/frontend/dist/` — no NGINX reload needed. New files are picked up immediately since Vite uses content-hashed filenames (`index-C7byXvBa.js`), so browsers fetch the new bundle automatically.

### 4. Restart services

```bash
sudo systemctl restart cleave-api cleave-worker
```

**Verify:**

```bash
sudo systemctl status cleave-api cleave-worker
# Both should show "active (running)"

curl -s http://localhost:8000/api/v1/health
# {"status":"ok"}
```

### 5. Verify in browser

1. Hard-refresh the page (`Cmd+Shift+R`) to clear cached JS/CSS
2. Check the feature you deployed works as expected
3. Check the API docs at `https://cleave.nazalibhai.com/api/v1/docs` (Swagger) if you added new endpoints

---

## When to Do What

| What changed | Steps needed |
|-------------|-------------|
| Backend code only (no new deps, no migrations) | Pull → Restart |
| Backend + new Python packages | Pull → `pip install -e .` → Restart |
| Backend + new migration | Pull → `pip install -e .` → `alembic upgrade head` → Restart |
| Frontend code only | Pull → Build locally → SCP `dist/` → No restart needed |
| Both backend + frontend | Pull → pip install → alembic → Build locally → SCP → Restart |
| Pipeline reference data (blacklists, adapters) | Pull → Restart worker only (`sudo systemctl restart cleave-worker`) |
| NGINX config change | Pull → `sudo nginx -t` → `sudo systemctl reload nginx` |
| `.env` config change | Edit `.env` on EC2 → Restart |
| New seed script | Pull → Run script manually |

---

## Checking Logs After Update

```bash
# API logs (watch for startup errors)
sudo journalctl -u cleave-api -f --no-pager

# Worker logs (watch for pipeline errors)
sudo journalctl -u cleave-worker -f --no-pager

# NGINX (watch for 502s)
sudo tail -f /var/log/nginx/error.log
```

---

## Rollback

If something breaks:

```bash
# See recent commits
cd /data2/cleave/app
git log --oneline -10

# Roll back to a specific commit
git checkout <commit-hash>

# Rebuild frontend if needed (on local Mac, checkout same commit, npm run build, scp)

# Restart
sudo systemctl restart cleave-api cleave-worker
```

To go back to latest after fixing:

```bash
git checkout main
git pull origin main
sudo systemctl restart cleave-api cleave-worker
```
