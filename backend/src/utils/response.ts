import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/** Every successful response uses the same envelope: { success, data, meta? }. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): Response {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(statusCode).json(body);
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
