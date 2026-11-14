/**
 * Выбор реализации API.
 * VITE_API=local — расчёт в браузере (прототип, работает без сервера);
 * VITE_API=http или не задано — Flask API на /api (см. backend/, §18).
 */
import { httpApi } from './httpApi';
import { localApi } from './localApi';
import type { XScienceApi } from './types';

const MODE = (import.meta.env?.VITE_API ?? 'http').toLowerCase();

export const api: XScienceApi = MODE === 'local' ? localApi : httpApi;
export * from './types';
