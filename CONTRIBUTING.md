# Contributing & GitHub Workflow

## Repository & Branching

Repository: `CBT-KARTINI-1`

- `main`: Stable, approved production code. Never force-push to `main`.
- `develop`: Integration branch for tested features.
- `feature/*`: New feature branches created from `develop`.
- `fix/*`: Bug fix branches created from `develop`.

## Commit Message Convention

- `feat: create authentication module`
- `feat: add question media upload`
- `feat: implement Word import`
- `feat: add examination timer`
- `feat: implement matching questions`
- `fix: repair audio playback`
- `fix: correct result calculation`
- `docs: update README`

## Pull Request Checklist

1. Run `npm run lint` (zero TypeScript errors).
2. Run `npm test` (all unit and integration tests pass).
3. Run `npm run build` (clean production Vite bundle).
4. Review `git diff` to ensure no secrets or database files are committed.
5. Open a Pull Request into `develop` (or `main` after review).

## Connecting a Fresh Local Workspace to GitHub

```bash
git init
git branch -M main
git remote add origin https://github.com/<ORG_OR_USER>/CBT-KARTINI-1.git
git checkout -b develop
git add .
git commit -m "feat: initialize KARTINI CBT 4.0 clean build"
git push -u origin develop
```
