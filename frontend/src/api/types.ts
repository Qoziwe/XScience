/**
 * Контракт клиента с источником данных.
 * Сейчас реализован локально (localApi, расчёт в браузере).
 * [БЭКЕНД] httpApi реализует тот же интерфейс через Flask API (FUNCTIONAL_SPEC.md §18),
 * экраны при переключении не меняются.
 */
import type { Analysis, AnalysisParams, Level, SectorId } from '@/domain/types';

export interface NewAnalysis {
  sector: SectorId;
  params: AnalysisParams;
}

export interface CreateAnalysisResult {
  analysis: Analysis;
  /** §18.3 — null при вердикте low; иначе вердикт, по нему клиент открывает окно оповещения. */
  alertLevel: Level | null;
}

export interface LoginResult {
  stage: 'code_required';
}

export interface SessionUser {
  login: string;
  role: string;
  /** HH:MM — до какого времени активна сессия. */
  expiresAt: string;
}

export interface AuthApi {
  /** POST /api/auth/login */
  login(login: string, password: string): Promise<LoginResult>;
  /** POST /api/auth/code */
  verifyCode(code: string): Promise<SessionUser>;
  /** POST /api/auth/logout */
  logout(): Promise<void>;
}

export interface AnalysesApi {
  /** GET /api/analyses — по возрастанию id. */
  list(): Promise<Analysis[]>;
  /** POST /api/analyses */
  create(input: NewAnalysis): Promise<CreateAnalysisResult>;
  /** Изменения истории (включая смену статуса передачи отчёта). */
  subscribe(listener: (hist: Analysis[]) => void): () => void;
}

export interface XScienceApi {
  auth: AuthApi;
  analyses: AnalysesApi;
}

/** Ошибка валидации входа. §18.9 */
export class ValidationError extends Error {
  constructor(
    public fields: Record<string, string>,
    message = 'validation_failed',
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends Error {
  constructor(
    public code: 'invalid_credentials' | 'invalid_code' | 'restart_login' | 'locked',
    public attemptsLeft?: number,
    public retryAfterS?: number,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}
