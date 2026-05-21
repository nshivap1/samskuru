# संस्कुरु · Sandhi 2048

Mobile-first Sanskrit sandhi and anuṣṭubh puzzle built from the v4 PRD in `sandhi_2048_mobile_prd_v3.md`.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run deploy:check
npm run validate:targets:draft -- content/target-packs/starter_word_targets.draft.json
```

## Product Review URL

The current local dev server is intended to run at:

```text
http://127.0.0.1:5174/
```

## Included

- 4x4 2048-style sandhi board with swipe and keyboard input.
- Target-driven endless mode with three active Sanskrit word targets.
- Anuṣṭubh Endless foundation with strict pathyā pāda construction and meter merges.
- Unlimited undo in the current run.
- Action log, hint flow, rule reference, and settings sheet.
- Devanagari-first app title and default Devanagari tiles, with IAST available in settings.
- Local persistence for the current run, high score, and preferences.
- Draft starter target pack and mechanical build-path validator for the v5 target-driven endless redesign.
- Unit and smoke tests for rules, reducer behavior, target completion/spawn behavior, meter validation/merges, persistence, and UI completion.

## Alpha Deployment

The app is configured for Vercel as a static Vite deployment.

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`
- Node version: `22`
- Pre-deploy check: `npm run deploy:check`

Set `VITE_ALPHA_FEEDBACK_URL` in Vercel to a Tally, Google Form, Typeform, or other feedback URL. If it is not set, the in-app Feedback button falls back to a mailto link.

Optional analytics are wired for Plausible without adding a runtime dependency. Set `VITE_PLAUSIBLE_DOMAIN` to the deployed alpha domain to enable the script. Leave it empty to ship with no analytics.

This alpha build is intentionally marked `noindex` in metadata and Vercel response headers. Remove that after the app is ready for public discovery.
