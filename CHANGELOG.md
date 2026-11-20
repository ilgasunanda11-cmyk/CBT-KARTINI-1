# Changelog

## [4.0.0] - 2026-11-20

### Added
- Clean-build full-stack architecture for KARTINI CBT 4.0 (SMP Kartini 1 Batam — Yayasan Keluarga Batam).
- Official dual-logo institutional header (`logo-ykb.png` left, `logo-smp-kartini.png` right) across all portals, exam interfaces, and print views.
- Normalized 22-table SQLite relational schema with foreign key integrity, indexes, and transactions.
- Session-based authentication with bcrypt hashing, separate Admin/Teacher login portals, secure first-time Admin setup, password strength indicator, and reset token workflow.
- Five interactive question types (Multiple Choice, Multiple Select, Matching with drag-and-drop & dropdown, True/False, Essay).
- Centralized Media Library and persistent image/audio uploads across questions, instructions, options, and matching columns with magic-byte validation.
- Question Import Center supporting Excel (`.xlsx`), CSV (`.csv`), Word (`.docx` with embedded image extraction), and `.zip` audio packages.
- Loginless student examination engine with audio/fullscreen readiness check, persistent server-validated timer, auto-save, and Visibility/Fullscreen anti-cheating monitoring.
- Real-time WebSocket monitoring dashboard, manual essay grading with rubrics, class ranking, Excel/CSV export, and printable reports.
- Vitest unit and Supertest integration test suites and GitHub Actions CI/CD/Backup workflows.
