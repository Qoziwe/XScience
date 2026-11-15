/**
 * API implementation selection.
 * VITE_API=local — calculation in the browser (prototype, works without a server);
 * VITE_API=http or unset — Flask API at /api (see backend/, §18).
 */
import { httpApi } from './httpApi';
import { localApi } from './localApi';
import type { XScienceApi } from './types';

const MODE = (import.meta.env?.VITE_API ?? 'http').toLowerCase();

export const api: XScienceApi = MODE === 'local' ? localApi : httpApi;
export * from './types';
