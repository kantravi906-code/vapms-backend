# VAPMS — Complete Connected Package

Two parts, now wired together:

- **backend/** — Express + PostgreSQL API. Deploy this FIRST. See backend/README.md.
- **frontend/** — the React site (also a PWA/mobile app). Set `VITE_API_URL` in its
  `.env` to your deployed backend's URL, then build and deploy. See
  frontend/PUBLISH.md.

Deploy order matters: backend needs a live URL before the frontend build can talk to
it, and the backend's CORS_ORIGIN needs the frontend's live URL once that exists too
(a one-time back-and-forth on first deploy).

Demo accounts (created by `npm run seed` in backend/): see backend/src/scripts/seed.js
or the "Show demo accounts" link on the frontend's login screen.
