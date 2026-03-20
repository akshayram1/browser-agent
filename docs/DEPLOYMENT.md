# Deployment Guide

## npm Package

### Publish a new version manually

```bash
npm run build
npm publish --access public
```

The CI pipeline auto-bumps the patch version on every push to `main`, so manual version bumps are only needed for minor/major releases:

```bash
npm version minor   # 0.2.x → 0.3.0
npm version major   # 0.x.y → 1.0.0
npm run build
npm publish --access public
```

### Required secret

Add `NPM_TOKEN` to your GitHub repository secrets if you want the pipeline to publish automatically (not enabled by default).

---

## Vercel (Static Site / Chatbot Demo)

The homepage and chatbot demo are static files served from the repo root.

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Vercel picks up `vercel.json` automatically — no extra configuration needed.
3. Every push to `main` triggers a new deployment.

`vercel.json` key settings:
```json
{
  "buildCommand": null,
  "outputDirectory": "."
}
```

---

## Chrome Extension (local / sideload)

1. Build the extension bundle:
   ```bash
   npm run build
   ```
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `public/` folder.

To update after code changes, rebuild and click the refresh icon on the extension card.

---

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`:

1. Installs dependencies.
2. Runs `npm test` (Node built-in test runner, no extra deps).
3. Bumps the patch version in `package.json` via `npm version patch`.
4. Commits and pushes the version bump with `[skip ci]` to avoid a second run.

The commit is made by `github-actions[bot]` using the built-in `GITHUB_TOKEN` — no extra secrets required.
