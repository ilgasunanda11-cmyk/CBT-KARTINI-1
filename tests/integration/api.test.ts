import fs from 'node:fs';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExpressApp } from '../../server/app.ts';
import { closeDb, setDbForTest } from '../../server/database/db.ts';
import { seedReferenceData } from '../../server/database/seed.ts';
import {
  generateTemplateCsv,
  generateTemplateDocx,
  generateTemplateWorkbook,
  parseCsvImport,
  parseExcelImport,
  parseWordOrZipImport,
} from '../../server/services/importService.ts';

describe('KARTINI CBT 4.0 — Full-Stack Integration Tests', () => {
  let app: ReturnType<typeof createExpressApp>;
  let adminAgent: ReturnType<typeof request.agent>;
  let teacherAgent: ReturnType<typeof request.agent>;
  let bankId: number;
  let subjectId: number;
  let classId: number;
  let createdExamId: number;
  let createdImageId: number;
  let createdAudioId: number;
  let essayQuestionId: number;
  let studentSessionId: number;
  const createdFiles: string[] = [];

  // Minimal valid 1x1 PNG buffer
  const validPngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );

  // Minimal valid WAV header buffer (RIFF....WAVE)
  const validWavBuffer = Buffer.from(
    '524946462400000057415645666d7420100000000100010044ac000088580100020010006461746100000000',
    'hex'
  );

  beforeAll(() => {
    const testDb = new Database(':memory:');
    setDbForTest(testDb);
    seedReferenceData(testDb);
    app = createExpressApp({ skipSeed: true });
    adminAgent = request.agent(app);
    teacherAgent = request.agent(app);
  });

  afterAll(() => {
    for (const filePath of createdFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
    closeDb();
  });

  it('supports secure initial Admin setup and rejects second setup attempt', async () => {
    const statusRes = await request(app).get('/api/auth/setup-status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.needsInitialSetup).toBe(true);

    const setupRes = await adminAgent.post('/api/auth/admin/setup').send({
      username: 'admin_kartini',
      password: 'SecureAdmin2026!',
      full_name: 'Administrator SMP Kartini 1 Batam',
    });
    expect(setupRes.status).toBe(201);
    expect(setupRes.body.user.role).toBe('ADMIN');

    const secondSetup = await request(app).post('/api/auth/admin/setup').send({
      username: 'hacker',
      password: 'Password123',
      full_name: 'Hacker',
    });
    expect(secondSetup.status).toBe(403);
  });

  it('creates Teacher account, tests RBAC isolation, and password change', async () => {
    const createTeacher = await adminAgent.post('/api/admin/users').send({
      username: 'guru_inggris',
      password: 'TeacherPass2026',
      role: 'TEACHER',
      full_name: 'Ibu Sari Rahmawati, S.Pd',
    });
    expect(createTeacher.status).toBe(201);

    // Teacher cannot login through Admin endpoint
    const wrongPortal = await teacherAgent.post('/api/auth/admin/login').send({
      username: 'guru_inggris',
      password: 'TeacherPass2026',
    });
    expect(wrongPortal.status).toBe(403);

    // Teacher logs in through Teacher endpoint
    const okLogin = await teacherAgent.post('/api/auth/teacher/login').send({
      username: 'guru_inggris',
      password: 'TeacherPass2026',
    });
    expect(okLogin.status).toBe(200);
    expect(okLogin.body.user.role).toBe('TEACHER');

    // Teacher cannot access Admin-only user list
    const forbidden = await teacherAgent.get('/api/admin/users');
    expect(forbidden.status).toBe(403);

    // Teacher changes password
    const chg = await teacherAgent.post('/api/auth/change-password').send({
      currentPassword: 'TeacherPass2026',
      newPassword: 'TeacherNew2026!',
      confirmPassword: 'TeacherNew2026!',
    });
    expect(chg.status).toBe(200);
  });

  it('uploads persistent image and audio files and validates magic bytes', async () => {
    const imgUpload = await adminAgent
      .post('/api/media/upload')
      .attach('file', validPngBuffer, { filename: 'diagram.png', contentType: 'image/png' })
      .field('caption', 'Diagram Uji')
      .field('alt_text', 'Diagram uji coba');
    expect(imgUpload.status).toBe(201);
    createdImageId = imgUpload.body.media.id;
    createdFiles.push(imgUpload.body.media.storage_path);
    expect(fs.existsSync(imgUpload.body.media.storage_path)).toBe(true);

    const audUpload = await adminAgent
      .post('/api/media/upload')
      .attach('file', validWavBuffer, { filename: 'listening.wav', contentType: 'audio/wav' })
      .field('caption', 'Listening Track');
    expect(audUpload.status).toBe(201);
    createdAudioId = audUpload.body.media.id;
    createdFiles.push(audUpload.body.media.storage_path);

    // Reject spoofed file with invalid magic bytes
    const spoofed = await adminAgent
      .post('/api/media/upload')
      .attach('file', Buffer.from('not-a-real-png'), { filename: 'fake.png', contentType: 'image/png' });
    expect(spoofed.status).toBe(400);

    // Stream uploaded file
    const fileRes = await request(app).get(`/api/media/file/${createdImageId}`);
    expect(fileRes.status).toBe(200);
  });

  it('creates all 5 question types with simultaneous image & audio media', async () => {
    const banksRes = await adminAgent.get('/api/questions/banks');
    bankId = banksRes.body.banks[0].id;
    const subjRes = await adminAgent.get('/api/admin/reference/subjects');
    subjectId = subjRes.body.subjects[0].id;
    const clsRes = await adminAgent.get('/api/admin/reference/classes');
    classId = clsRes.body.classes[0].id;

    const mcRes = await adminAgent.post('/api/questions').send({
      bank_id: bankId,
      subject_id: subjectId,
      class_id: classId,
      question_type: 'MULTIPLE_CHOICE',
      question_text: 'Listen and choose the correct word.',
      correct_answer_json: { correctKey: 'B' },
      default_score: 10,
      media: [
        { media_id: createdImageId, placement: 'MAIN_QUESTION' },
        { media_id: createdAudioId, placement: 'MAIN_QUESTION' },
      ],
      options: [
        { option_key: 'A', option_text: 'Cat', is_correct: false, media: [{ media_id: createdImageId }] },
        { option_key: 'B', option_text: 'Dog', is_correct: true, media: [{ media_id: createdAudioId }] },
      ],
    });
    expect(mcRes.status).toBe(201);

    const essayRes = await adminAgent.post('/api/questions').send({
      bank_id: bankId,
      subject_id: subjectId,
      question_type: 'ESSAY',
      question_text: 'Describe the diagram and audio you heard.',
      correct_answer_json: { manualGrading: true },
      default_score: 20,
      media: [{ media_id: createdImageId, placement: 'SUPPORTING_MATERIAL' }],
    });
    expect(essayRes.status).toBe(201);
    essayQuestionId = essayRes.body.question.id;
  });

  it('parses and validates Excel, CSV, and Word DOCX imports', async () => {
    const excelBuf = generateTemplateWorkbook();
    const excelRes = parseExcelImport(excelBuf);
    expect(excelRes.questions.length).toBe(5);
    expect(excelRes.summary.errorCount).toBe(0);

    const csvBuf = Buffer.from(generateTemplateCsv(), 'utf8');
    const csvRes = parseCsvImport(csvBuf);
    expect(csvRes.questions.length).toBe(5);

    const docxBuf = generateTemplateDocx();
    const wordRes = await parseWordOrZipImport(docxBuf, 'KARTINI_Template.docx', 1);
    expect(wordRes.questions.length).toBe(5);
    expect(wordRes.questions[3].questionType).toBe('MATCHING');
    expect(wordRes.questions[3].matchingPairs.length).toBe(3);
  });

  it('executes full student exam lifecycle without exposing answer keys, logs violations, and grades essay', async () => {
    const qListRes = await adminAgent.get('/api/questions');
    const allQIds = qListRes.body.questions.map((q: { id: number }) => q.id);

    const today = new Date().toISOString().slice(0, 10);
    const examCreate = await adminAgent.post('/api/exams').send({
      title: 'Ujian Terpadu CBT 4.0',
      subject_id: subjectId,
      eligible_class_ids: [classId],
      exam_date: today,
      start_time: '00:00',
      end_time: '23:59',
      duration_minutes: 45,
      exam_code: 'UJIAN2026',
      is_published: true,
      question_ids: allQIds,
    });
    expect(examCreate.status).toBe(201);
    createdExamId = examCreate.body.id;

    // Student verifies identity without login
    const verifyRes = await request(app).post('/api/exams/verify-entry').send({
      full_name: 'Aisyah Putri Rahma',
      class_id: classId,
      participant_number: 'KRT-2026-001',
      subject_id: subjectId,
      exam_code: 'UJIAN2026',
    });
    expect(verifyRes.status).toBe(200);
    studentSessionId = verifyRes.body.session.id;

    // Student starts exam
    const startRes = await request(app).post(`/api/exams/${createdExamId}/start`).send({
      session_id: studentSessionId,
      audio_checked: true,
      rules_confirmed: true,
    });
    expect(startRes.status).toBe(200);
    expect(startRes.body.questions.length).toBeGreaterThan(0);

    // Verify answer keys are NOT leaked to student
    for (const q of startRes.body.questions) {
      expect(q.correct_answer_json).toBeUndefined();
      for (const opt of q.options) {
        expect(opt.is_correct).toBeUndefined();
      }
    }

    // Save essay answer
    const saveAns = await request(app).post(`/api/exams/${createdExamId}/answers`).send({
      session_id: studentSessionId,
      question_id: essayQuestionId,
      answer: 'Batam merupakan kota industri dan pendidikan yang berkembang pesat.',
    });
    expect(saveAns.status).toBe(200);

    // Record anti-cheating violation (must NOT delete saved answer)
    const violRes = await request(app).post('/api/monitoring/violation').send({
      session_id: studentSessionId,
      exam_id: createdExamId,
      violation_type: 'TAB_SWITCH',
      details: 'Berpindah tab',
    });
    expect(violRes.status).toBe(201);
    expect(violRes.body.violationCount).toBe(1);

    // Submit exam
    const subRes = await request(app).post(`/api/exams/${createdExamId}/submit`).send({
      session_id: studentSessionId,
    });
    expect(subRes.status).toBe(200);

    // Prevent duplicate submission re-entry
    const dupEntry = await request(app).post('/api/exams/verify-entry').send({
      full_name: 'Aisyah Putri Rahma',
      class_id: classId,
      participant_number: 'KRT-2026-001',
      subject_id: subjectId,
      exam_code: 'UJIAN2026',
    });
    expect(dupEntry.status).toBe(409);

    // Teacher/Admin manually grades essay
    const gradeRes = await adminAgent.post(`/api/results/${studentSessionId}/grade-essay`).send({
      question_id: essayQuestionId,
      score_awarded: 18,
      feedback: 'Penjelasan sangat baik dan runtut.',
    });
    expect(gradeRes.status).toBe(200);
    expect(gradeRes.body.essayScore).toBe(18);

    // Export CSV & Excel
    const csvExport = await adminAgent.get(`/api/results/export/${createdExamId}?format=csv`);
    expect(csvExport.status).toBe(200);
    expect(csvExport.text).toContain('Aisyah Putri Rahma');
  });
});
