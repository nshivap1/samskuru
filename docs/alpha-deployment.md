# Alpha Deployment Runbook

## Host

Use Vercel for the first alpha. This repository is a static Vite app: it builds to `dist`, has no backend, and persists player state in `localStorage`.

## One-Time Setup

1. Push the project to a GitHub repository with `main` as the production branch.
2. Import the repository into Vercel.
3. Use the checked-in Vercel settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm ci`
   - Node version: `22`
4. Optional: set `VITE_PLAUSIBLE_DOMAIN` to enable Plausible analytics. Leave it empty for a no-analytics alpha.

## Before Each Alpha Link Share

Run:

```bash
npm run deploy:check
```

Then verify the deployed URL on:

- iPhone Safari
- Android Chrome
- Desktop Chrome or Safari

Check swipe movement, keyboard movement, target completion, restart from stuck state, script setting, and tile rendering.

## Alpha Tester Prompt

Ask each tester to play three runs and answer:

1. Where did the mechanics feel unfair or confusing?
2. Did any Sanskrit merge feel wrong?
3. Did you successfully complete at least one visible target?
4. What device and browser did you use?
