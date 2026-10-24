export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

// Bound collections before Zod 3 traverses them (including model/provider output).
export function boundInput(value: unknown, depth = 0): void {
  if (depth > 16) throw new AppError(400, 'INPUT_LIMIT', 'Input is nested too deeply');
  if (typeof value === 'string' && value.length > 1_500_000)
    throw new AppError(400, 'INPUT_LIMIT', 'String exceeds limit');
  if (value && typeof value === 'object') {
    const values = Array.isArray(value) ? value : Object.values(value);
    if (values.length > 100) throw new AppError(400, 'INPUT_LIMIT', 'Collection exceeds limit');
    values.forEach(v => boundInput(v, depth + 1));
  }
}
