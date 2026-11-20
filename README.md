# KARTINI CBT 4.0 — Online Examination Management System

**Institution:** SMP Kartini 1 Batam  
**Foundation:** Yayasan Keluarga Batam  
**Repository:** `CBT-KARTINI-1`

KARTINI CBT 4.0 is a clean-build, full-stack Computer-Based Test (CBT) examination management system built with React, TypeScript, Tailwind CSS, Express, WebSockets (`ws`), and SQLite (`better-sqlite3`).

## Core Features

- **Official Dual-Logo Institutional Identity**: YKB logo on the left and SMP Kartini 1 Batam logo on the right across the homepage, login portals, dashboards, student examination screens, results, and printable reports.
- **Role-Based Access Control (Admin & Teacher)**:
  - **Admin** holds full Teacher capabilities plus student, teacher, class, subject, system settings, and security audit log management.
  - **Teacher** manages question banks, multimedia questions, Excel/CSV/Word/ZIP imports, authorized exams, live monitoring, essay grading, and results export.
  - **Secure Initial Admin Setup**: No hardcoded default passwords. On first launch, `/admin/login` prompts creation of the primary Administrator account.
- **Student Examination Without Login**: Direct identity verification (`Full Name`, `Class`, `Participant Number`, `Subject`, `Exam Code`), schedule & duplicate submission checks, pre-exam internet/browser/fullscreen/audio check, persistent server-validated `HH:MM:SS` timer, auto-save, and anti-cheating monitoring (Visibility API, Fullscreen API, Page Lifecycle).
- **Five Question Types with Multi-Placement Image & Audio Support**:
  1. Multiple Choice (A–D, optional E)
  2. Multiple Select (checkboxes with optional partial credit)
  3. Matching (drag-and-drop + dropdown alternative, randomized Column B, individual pair scoring)
  4. True / False
  5. Essay (auto-saving, rubric, manual teacher grading & feedback)
  - Supports images (`JPG`, `JPEG`, `PNG`, `WEBP` up to 10 MB) and audio (`MP3`, `WAV`, `M4A`, `OGG` up to 25 MB) simultaneously across main questions, instructions, answer options, matching Columns A & B, True/False statements, and Essay supporting material.
- **Question Import Center**: Downloadable official templates and validated preview/edit/commit workflows for **Excel (`.xlsx`)**, **CSV (`.csv`)**, **Word (`.docx`)** with embedded image extraction, and **ZIP packages** containing `.docx` + audio files (`QUESTION_001.mp3`, `OPTION_001_A.mp3`).
- **Live WebSocket Monitoring & Results Export**: Real-time student progress, timer countdown, violation feed, class ranking, highest/lowest/average analytics, Excel/CSV export, and printable reports.

## Project Structure

- `server.ts` — HTTP + WebSocket + Vite/Static production entrypoint on port 3000
- `server/` — Express app, SQLite schema/migrations/seeds, auth & upload middleware, grading & import services, REST routes, WebSocket server, and persistent media storage
- `src/` — React 19 SPA with React Router, TanStack Query, Tailwind CSS v4, components, layouts, and pages
- `tests/` — Vitest unit and Supertest integration test suites
- `.github/workflows/` — CI, Deploy, and Backup workflows

## Development & Testing Commands

```bash
# Install dependencies
npm install

# Run full-stack development server (Express + WebSocket + Vite) on port 3000
npm run dev

# TypeScript validation
npm run lint

# Run automated unit and integration tests
npm test

# Build production frontend bundle
npm run build

# Start production server
NODE_ENV=production npm start
```

## API Overview

- **Auth**: `GET /api/auth/setup-status`, `POST /api/auth/admin/setup`, `POST /api/auth/admin/login`, `POST /api/auth/teacher/login`, `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/logout`
- **Questions**: `GET/POST /api/questions`, `PUT/DELETE /api/questions/:id`, `POST /api/questions/:id/duplicate`, `GET/POST /api/questions/banks`
- **Import**: `GET /api/import/template/:format`, `POST /api/import/excel`, `POST /api/import/csv`, `POST /api/import/word`, `POST /api/import/preview`, `POST /api/import/confirm`
- **Media**: `POST /api/media/upload`, `GET /api/media`, `GET /api/media/:id`, `GET /api/media/file/:id`, `PUT/DELETE /api/media/:id`
- **Exams & Submissions**: `GET/POST /api/exams`, `PUT/DELETE /api/exams/:id`, `POST /api/exams/verify-entry`, `POST /api/exams/:id/start`, `POST /api/exams/:id/answers`, `POST /api/exams/:id/submit`
- **Monitoring & Results**: `GET /api/monitoring`, `POST /api/monitoring/violation`, `GET /api/results`, `GET /api/results/:id`, `POST /api/results/:id/grade-essay`, `GET /api/results/export/:examId`
