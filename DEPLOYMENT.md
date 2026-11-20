# Deployment, Backup & Restoration Guide

## Hosting Requirements

KARTINI CBT 4.0 uses a persistent Node.js Express server, WebSockets (`/ws`), SQLite database (`server/database/kartini_cbt.db`), and persistent local disk storage (`server/storage/images`, `server/storage/audio`). Because of this, **static-only hosts like GitHub Pages cannot host the backend**. Deploy to a VPS, VM, or container runtime with persistent disk storage (e.g., Ubuntu VPS with PM2/systemd, Docker volume, or Cloud Run/Render/Railway with attached disk).

## Environment Configuration

Copy `.env.example` to `.env` and configure:
- `PORT=3000`
- `NODE_ENV=production`
- `SESSION_SECRET=<strong-random-64-char-hex-string>`
- `DATABASE_PATH=/var/data/kartini_cbt.db` (recommended outside git checkout directory on persistent volume)

## Build & Start

```bash
npm ci
npm run lint
npm test
npm run build
NODE_ENV=production npm start
```

## Backup & Restoration

1. **Database Backup**: Use SQLite online backup (`sqlite3 kartini_cbt.db ".backup '/backups/kartini_cbt_$(date +%F).db'"`) to avoid locking issues while WAL mode is active.
2. **Media Storage Backup**: Sync `server/storage/images/` and `server/storage/audio/` alongside the database backup so question-media references remain intact.
3. **Restoration**: Stop the Node.js service, restore `kartini_cbt.db` and `server/storage/{images,audio}` from the same snapshot timestamp, verify file permissions, and start the service.

## Troubleshooting

- **Audio/Image upload rejected**: Check file extension, genuine MIME/magic bytes, and size limits (`10 MB` images, `25 MB` audio, configurable in Admin Settings).
- **WebSocket not connecting behind reverse proxy (Nginx/Caddy)**: Ensure `Upgrade` and `Connection: upgrade` headers are forwarded on `/ws`.
