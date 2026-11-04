---
name: smoke-test-server
description: Boot the Vite dev server on a spare port and exercise the /api/agent, /api/web and /api/convert endpoints with curl, checking auth, sandbox and SSRF behavior. Use after changing anything in server/ or shared/.
---

1. Start `npx vite --port 5199 --host 127.0.0.1` in the background; remember its PID; wait ~4s. Never use port 5173
   and never kill by name (`pkill`): stop only that PID.
2. Make a temp workspace dir `W`. Expect:
   - `POST /api/agent/check` without `X-Agent: 1` → 403; with it and `{"workspace": W}` → `ok:true`
   - `write_file` then `read_file` round-trips non-ASCII text (e.g. `héllo 🌍`)
   - `read_file` of `../../etc/passwd` → "Path is outside the workspace"
   - `run_command` `pkill node` → "Refused…"; `echo hi` → output with `[exit 0]`
   - `GET /api/web/search?q=x` with `-H 'Host: evil.com'` → 403 (same for `/api/convert/status`)
   - `GET /api/web/fetch?url=http://127.0.0.1:5199/` → "Refusing to fetch private address"
   - `GET /api/convert/status` → `{"pdf": true|false}`
3. Kill the dev server PID, delete the temp dir, and report each expectation as pass/fail.
