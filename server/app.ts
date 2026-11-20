import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { seedReferenceData } from './database/seed.ts';
import { attachAuthUser } from './middleware/auth.ts';
import adminRoutes from './routes/adminRoutes.ts';
import authRoutes from './routes/authRoutes.ts';
import examRoutes from './routes/examRoutes.ts';
import importRoutes from './routes/importRoutes.ts';
import mediaRoutes from './routes/mediaRoutes.ts';
import monitoringRoutes from './routes/monitoringRoutes.ts';
import questionRoutes from './routes/questionRoutes.ts';
import resultRoutes from './routes/resultRoutes.ts';
import submissionRoutes from './routes/submissionRoutes.ts';

export function createExpressApp(options?: { skipSeed?: boolean }) {
  if (!options?.skipSeed) {
    seedReferenceData();
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());
  app.use(attachAuthUser);

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'KARTINI CBT 4.0', timestamp: new Date().toISOString() });
  });

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/exams', submissionRoutes);
  app.use('/api/monitoring', monitoringRoutes);
  app.use('/api/results', resultRoutes);

  // Centralized API 404 & Error Handler
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err);
    res.status(500).json({ error: err.message || 'Terjadi kesalahan internal server.' });
  });

  return app;
}
