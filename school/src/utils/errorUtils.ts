export type ErrorLike = {
  message?: unknown
  name?: unknown
  stack?: unknown
}

export function isErrorLike(error: unknown): error is ErrorLike {
  return typeof error === 'object' && error !== null
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return String(value)
  } catch {
    return ''
  }
}

export function getErrorMessage(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error) {
    return normalizeText(error.message) || fallback
  }

  if (isErrorLike(error)) {
    return normalizeText(error.message) || fallback
  }

  return normalizeText(error) || fallback
}

export function getErrorName(error: unknown, fallback = 'UnknownError'): string {
  if (error instanceof Error) {
    return normalizeText(error.name) || fallback
  }

  if (isErrorLike(error)) {
    return normalizeText(error.name) || fallback
  }

  return fallback
}
