export type UserRole = 'ADMIN' | 'TEACHER';

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_SELECT'
  | 'MATCHING'
  | 'TRUE_FALSE'
  | 'ESSAY';

export type MediaPlacement =
  | 'MAIN_QUESTION'
  | 'INSTRUCTIONS'
  | 'STATEMENT'
  | 'SUPPORTING_MATERIAL';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  is_active: number;
  must_change_password: number;
  nip?: string;
  phone?: string;
  subject_ids_json?: string;
  class_ids_json?: string;
}

export interface SchoolClass {
  id: number;
  name: string;
  grade_level: number;
  academic_year: string;
  student_count?: number;
}

export interface Subject {
  id: number;
  code: string;
  name: string;
  description: string;
  question_count?: number;
}

export interface StudentRecord {
  id: number;
  participant_number: string;
  full_name: string;
  class_id: number;
  class_name: string;
  gender: string;
  is_active: number;
}

export interface MediaFile {
  id: number;
  filename: string;
  original_name: string;
  media_type: 'IMAGE' | 'AUDIO';
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  duration_seconds: number;
  alt_text: string;
  caption: string;
  uploaded_by_user_id: number;
  uploader_name?: string;
  is_shared: number;
  usage_count?: number;
  created_at: string;
}

export interface AttachedMedia {
  id?: number;
  media_id: number;
  media_type: 'IMAGE' | 'AUDIO';
  original_name?: string;
  mime_type?: string;
  duration_seconds?: number;
  placement?: MediaPlacement;
  caption?: string;
  alt_text?: string;
  sort_order?: number;
}

export interface QuestionOption {
  id?: number;
  option_key: string;
  option_text: string;
  is_correct: boolean | number;
  sort_order?: number;
  media?: AttachedMedia[];
}

export interface MatchingPair {
  id?: number;
  pair_key: string;
  left_text: string;
  right_key: string;
  right_text: string;
  score: number;
  sort_order?: number;
  left_media?: AttachedMedia[];
  right_media?: AttachedMedia[];
}

export interface Question {
  id: number;
  bank_id: number;
  bank_title?: string;
  subject_id: number;
  subject_name?: string;
  class_id: number | null;
  class_name?: string;
  created_by_user_id: number;
  creator_name?: string;
  question_type: QuestionType;
  question_text: string;
  instructions: string;
  correct_answer_json: string;
  partial_credit: number;
  default_score: number;
  rubric_text: string;
  difficulty: string;
  media: AttachedMedia[];
  options: QuestionOption[];
  matching_pairs: MatchingPair[];
  created_at: string;
  updated_at: string;
}

export interface QuestionBank {
  id: number;
  title: string;
  description: string;
  subject_id: number;
  subject_name: string;
  class_id: number | null;
  class_name: string | null;
  owner_user_id: number;
  owner_name: string;
  is_shared: number;
  question_count: number;
}

export interface Exam {
  id: number;
  title: string;
  subject_id: number;
  subject_name?: string;
  class_id: number | null;
  class_name?: string;
  eligible_class_ids_json: string;
  teacher_user_id: number;
  teacher_name?: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  exam_code: string;
  question_count: number;
  assigned_question_count?: number;
  session_count?: number;
  randomize_questions: number;
  randomize_options: number;
  instructions: string;
  is_published: number;
  allow_audio_replay: number;
  max_audio_replays: number;
}

export interface StudentExamQuestion {
  id: number;
  question_type: QuestionType;
  question_text: string;
  instructions: string;
  score: number;
  media: AttachedMedia[];
  options: Array<{
    id: number;
    option_key: string;
    option_text: string;
    media: AttachedMedia[];
  }>;
  matching_left: Array<{
    id: number;
    pair_key: string;
    left_text: string;
    media: AttachedMedia[];
  }>;
  matching_right: Array<{
    pair_id: number;
    right_key: string;
    right_text: string;
    media: AttachedMedia[];
  }>;
}

export interface MonitoringSession {
  id: number;
  exam_id: number;
  exam_title: string;
  exam_code: string;
  subject_name: string;
  student_name: string;
  participant_number: string;
  class_name: string;
  status: 'READY' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  remaining_seconds: number;
  total_questions: number;
  answered_count: number;
  unanswered_count: number;
  violation_count: number;
  recent_violations: Array<{
    violation_type: string;
    details: string;
    occurred_at: string;
  }>;
}

export interface ExamResultRow {
  id: number;
  exam_id: number;
  exam_title: string;
  exam_code: string;
  subject_name: string;
  teacher_name: string;
  student_name: string;
  participant_number: string;
  class_id: number;
  class_name: string;
  status: string;
  started_at: string;
  submitted_at: string;
  total_score: number;
  max_score: number;
  auto_graded_score: number;
  essay_score: number;
  violation_count: number;
  rank: number;
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  pending_essay_count: number;
  duration_seconds: number;
}

export interface ParsedImportQuestion {
  tempId: string;
  number: number;
  subjectName: string;
  className: string;
  questionType: QuestionType;
  questionText: string;
  instructions: string;
  defaultScore: number;
  partialCredit: boolean;
  rubricText: string;
  options: Array<{
    optionKey: string;
    optionText: string;
    isCorrect: boolean;
    imageFilename?: string;
    audioFilename?: string;
    imageMediaId?: number;
    audioMediaId?: number;
  }>;
  matchingPairs: Array<{
    pairKey: string;
    leftText: string;
    rightKey: string;
    rightText: string;
    score: number;
  }>;
  correctAnswer: Record<string, unknown>;
  mediaRefs: Array<{
    mediaId: number;
    mediaType: 'IMAGE' | 'AUDIO';
    originalName: string;
    placement: MediaPlacement;
  }>;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}
