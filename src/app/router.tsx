import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ClassManagementPage, SubjectManagementPage } from '../pages/admin/ClassSubjectManagementPage';
import { SettingsAuditPage } from '../pages/admin/SettingsAuditPage';
import { StudentManagementPage } from '../pages/admin/StudentManagementPage';
import { UserManagementPage } from '../pages/admin/UserManagementPage';
import { ChangePasswordPage } from '../pages/auth/ChangePasswordPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { DashboardHome } from '../pages/dashboard/DashboardHome';
import { EssayGradingPage } from '../pages/dashboard/EssayGradingPage';
import { ExamManagementPage } from '../pages/dashboard/ExamManagementPage';
import { ExamMonitoringPage } from '../pages/dashboard/ExamMonitoringPage';
import { MediaLibraryPage } from '../pages/dashboard/MediaLibraryPage';
import { QuestionBankPage } from '../pages/dashboard/QuestionBankPage';
import { QuestionEditorPage } from '../pages/dashboard/QuestionEditorPage';
import { QuestionImportPage } from '../pages/dashboard/QuestionImportPage';
import { ResultsPage } from '../pages/dashboard/ResultsPage';
import { StudentExamFlow } from '../pages/exam/StudentExamFlow';
import { HomePage } from '../pages/public/HomePage';

function ProtectedRoute({
  allowedRoles,
  redirectTo,
  children,
}: {
  allowedRoles: Array<'ADMIN' | 'TEACHER'>;
  redirectTo: string;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Memuat sesi...
      </div>
    );
  }
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public & Student Exam Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/exam" element={<StudentExamFlow />} />

        {/* Auth Routes */}
        <Route path="/admin/login" element={<LoginPage role="ADMIN" />} />
        <Route path="/teacher/login" element={<LoginPage role="TEACHER" />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Admin Portal (Includes ALL Teacher features + System Administration) */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <DashboardHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/questions"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <QuestionBankPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/questions/new"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <QuestionEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/questions/:id/edit"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <QuestionEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/import"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <QuestionImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/media"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <MediaLibraryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/exams"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <ExamManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/monitoring"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <ExamMonitoringPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/essay-grading"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <EssayGradingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/results"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <StudentManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <UserManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <ClassManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/subjects"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <SubjectManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
              <SettingsAuditPage />
            </ProtectedRoute>
          }
        />

        {/* Teacher Portal */}
        <Route
          path="/teacher/dashboard"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <DashboardHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/questions"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <QuestionBankPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/questions/new"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <QuestionEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/questions/:id/edit"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <QuestionEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/import"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <QuestionImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/media"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <MediaLibraryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/exams"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <ExamManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/monitoring"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <ExamMonitoringPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/essay-grading"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <EssayGradingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/results"
          element={
            <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} redirectTo="/teacher/login">
              <ResultsPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
