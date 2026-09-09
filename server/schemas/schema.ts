/**
 * Minimal strict schema validator.
 *
 * No new dependency is introduced (cross-cutting rule 3). Objects are **strict**:
 * an unknown field is a validation error. That is the mechanism behind
 * `INV-005` — a crafted body carrying `model`, `config`, `tools` or
 * `systemInstruction` is rejected with `400 VALIDATION_FAILED` instead of being
 * forwarded anywhere.
 */

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export interface Schema<T> {
  readonly kind: string;
  parse(input: unknown, path?: string): ParseResult<T>;
}

function fail(path: string, message: string): ParseResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

function at(path: string | undefined, key: string | number): string {
  if (path === undefined || path === '') return String(key);
  return typeof key === 'number' ? `${path}[${key}]` : `${path}.${key}`;
}

function collect<T>(results: ParseResult<T>[]): { ok: true; values: T[] } | { ok: false; issues: ValidationIssue[] } {
  const values: T[] = [];
  const issues: ValidationIssue[] = [];
  for (const result of results) {
    if (result.ok) values.push(result.value);
    else issues.push(...result.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}

export interface StringOptions {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: RegExp;
  readonly trim?: boolean;
  readonly empty?: boolean;
}

export function str(options: StringOptions = {}): Schema<string> {
  return {
    kind: 'string',
    parse(input, path) {
      if (typeof input !== 'string') return fail(path ?? '', 'must be a string');
      const value = options.trim ? input.trim() : input;
      const min = options.minLength ?? 0;
      const max = options.maxLength ?? Number.POSITIVE_INFINITY;
      if (value.length < min) return fail(path ?? '', `must be at least ${min} characters`);
      if (value.length > max) return fail(path ?? '', `must be at most ${max} characters`);
      if (!options.empty && value.length === 0) return fail(path ?? '', 'must not be empty');
      if (options.pattern && !options.pattern.test(value)) return fail(path ?? '', 'has an unsupported format');
      return { ok: true, value };
    },
  };
}

export interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export function num(options: NumberOptions = {}): Schema<number> {
  return {
    kind: 'number',
    parse(input, path) {
      if (typeof input !== 'number' || !Number.isFinite(input)) return fail(path ?? '', 'must be a finite number');
      if (options.integer && !Number.isInteger(input)) return fail(path ?? '', 'must be an integer');
      if (options.min !== undefined && input < options.min) return fail(path ?? '', `must be >= ${options.min}`);
      if (options.max !== undefined && input > options.max) return fail(path ?? '', `must be <= ${options.max}`);
      return { ok: true, value: input };
    },
  };
}

export function bool(): Schema<boolean> {
  return {
    kind: 'boolean',
    parse(input, path) {
      if (typeof input !== 'boolean') return fail(path ?? '', 'must be a boolean');
      return { ok: true, value: input };
    },
  };
}

export function oneOf<T extends string>(values: readonly T[]): Schema<T> {
  return {
    kind: 'enum',
    parse(input, path) {
      if (typeof input !== 'string' || !values.includes(input as T)) {
        return fail(path ?? '', `must be one of: ${values.join(', ')}`);
      }
      return { ok: true, value: input as T };
    },
  };
}

export function arr<T>(item: Schema<T>, options: { minLength?: number; maxLength?: number } = {}): Schema<T[]> {
  return {
    kind: 'array',
    parse(input, path) {
      if (!Array.isArray(input)) return fail(path ?? '', 'must be an array');
      const min = options.minLength ?? 0;
      const max = options.maxLength ?? Number.POSITIVE_INFINITY;
      if (input.length < min) return fail(path ?? '', `must contain at least ${min} items`);
      if (input.length > max) return fail(path ?? '', `must contain at most ${max} items`);
      const collected = collect(input.map((entry, index) => item.parse(entry, at(path, index))));
      return collected.ok ? { ok: true, value: collected.values } : { ok: false, issues: collected.issues };
    },
  };
}

export type ObjectShape = Record<string, Schema<unknown>>;
export type InferShape<S extends ObjectShape> = { [K in keyof S]: S[K] extends Schema<infer T> ? T : never };

/**
 * Strict object schema: unknown keys are rejected, missing optional keys are
 * omitted (never defaulted to a fabricated value).
 */
export function obj<S extends ObjectShape>(shape: S, options: { optional?: readonly (keyof S)[] } = {}): Schema<InferShape<S>> {
  const optionalKeys = new Set<string>((options.optional ?? []).map((key) => String(key)));
  return {
    kind: 'object',
    parse(input, path) {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return fail(path ?? '', 'must be an object');
      }
      const record = input as Record<string, unknown>;
      const issues: ValidationIssue[] = [];
      const value: Record<string, unknown> = {};

      for (const key of Object.keys(record)) {
        if (!(key in shape)) issues.push({ path: at(path, key), message: 'is not an accepted field' });
      }

      for (const [key, schema] of Object.entries(shape)) {
        const present = Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
        if (!present) {
          if (optionalKeys.has(key)) continue;
          issues.push({ path: at(path, key), message: 'is required' });
          continue;
        }
        const parsed = schema.parse(record[key], at(path, key));
        if (parsed.ok) value[key] = parsed.value;
        else issues.push(...parsed.issues);
      }

      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as InferShape<S> };
    },
  };
}

export function parseWith<T>(schema: Schema<T>, input: unknown): ParseResult<T> {
  return schema.parse(input, '');
}

export function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path || '<root>'} ${issue.message}`)
    .join('; ');
}
