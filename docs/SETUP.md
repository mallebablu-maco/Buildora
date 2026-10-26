# Platform setup

## Supabase (Authentication)

Dashboard -> your `buildora` project.

1. **Authentication -> Sign In / Providers -> Email:** enabled (it is).
   - **Confirm email:** currently **ON** for your project. For development turn it **OFF** so a new account can log in immediately.
     Turn it back **ON** before real users. With it ON, the sign-up screen shows "Check your email" and the user must click the link first.
2. **Authentication -> URL Configuration** (needed for the confirmation and password-reset links):
   - **Site URL:** `http://localhost:5173` while developing; later your Render website URL.
   - **Redirect URLs:** add `http://localhost:5173/login`, `http://localhost:5173/reset-password`, and the same two paths on your Render website URL.
3. The email sender on Supabase's free plan is rate-limited (a few emails per hour). If sign-up or reset says "too many attempts",
   wait, or switch Confirm email off while developing.

Keys used by the app (all public): **Project URL** (`https://<ref>.supabase.co`, without `/rest/v1`) and the **publishable key**.
Never use the `service_role` / secret key in this project.

## Local environment files (git-ignored)

- `backend/.env` from `backend/.env.example`: `SUPABASE_URL`, `CORS_ORIGINS`.
- `frontend/.env.local` from `frontend/.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Try it locally

1. Start both servers (see README). Open http://localhost:5173.
2. **Create account** -> (if Confirm email is ON: click the emailed link) -> **Log in**.
3. The Dashboard shows a **Connection check**. Green means: Supabase signed you in **and** the API verified your token.
   If it is red, the message says what the API answered (401 = token rejected, 503 = API cannot reach Supabase's keys, "Cannot reach" = API not running).

## Render

Two services from the same GitHub repo. `render.yaml` describes both (untested); doing it by hand works the same.

**API: New -> Web Service**
- Root directory `backend`; Runtime Python; build `pip install -r requirements.txt`;
  start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; health check path `/api/health`; plan Free.
- Environment: `PYTHON_VERSION=3.11.9`, `ENVIRONMENT=production`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `CORS_ORIGINS` (the website's URL, set after the website exists).
- Check `https://<api>.onrender.com/api/health`.

**Website: New -> Static Site**
- Root directory `frontend`; build `npm ci && npm run build`; publish directory `dist`.
- Environment: `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` (the API's URL, no trailing slash).
- Redirects/Rewrites: source `/*` -> destination `/index.html`, action **Rewrite** (otherwise refreshing a deep link gives 404).

**Then connect them:** set the API's `CORS_ORIGINS` to the website URL and redeploy; set Supabase's **Site URL** and **Redirect URLs** to the website URL.

Free-plan behaviour: the API sleeps after about 15 minutes idle (the first request afterwards is slow); a Supabase free project pauses after about a week of inactivity.
