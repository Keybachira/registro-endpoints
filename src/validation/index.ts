/** A schema with a `parse` method that throws on failure (Zod and similar). */
export interface ParseSchema<T> {
  parse(data: unknown): T;
}

type StandardResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: readonly unknown[] };

/** Minimal structural view of the Standard Schema spec (`~standard`): Zod 3.24+, Valibot, ArkType... */
export interface StandardSchemaLike<T> {
  readonly "~standard": {
    readonly validate: (
      value: unknown,
    ) => StandardResult<T> | Promise<StandardResult<T>>;
    readonly types?:
      { readonly input: unknown; readonly output: T } | undefined;
  };
}

export type AnySchema<T> = ParseSchema<T> | StandardSchemaLike<T>;

export type InferSchema<S> =
  S extends StandardSchemaLike<infer T>
    ? T
    : S extends ParseSchema<infer T>
      ? T
      : never;

export type ValidationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: unknown };

/** Runs any supported schema. Never throws for validation failures. */
export async function runSchema<T>(
  schema: AnySchema<T>,
  data: unknown,
): Promise<ValidationOutcome<T>> {
  try {
    const std = (schema as Partial<StandardSchemaLike<T>>)["~standard"];
    if (std && typeof std.validate === "function") {
      const result = await std.validate(data);
      if (result.issues) return { ok: false, issues: result.issues };
      return { ok: true, value: (result as { value: T }).value };
    }
    const parse = (schema as ParseSchema<T>).parse;
    if (typeof parse === "function") {
      return { ok: true, value: parse.call(schema, data) };
    }
    return { ok: false, issues: "Unsupported schema object" };
  } catch (error) {
    return { ok: false, issues: error };
  }
}

export function isSchema(value: unknown): value is AnySchema<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const std = v["~standard"] as { validate?: unknown } | undefined;
  return (
    typeof v["parse"] === "function" || typeof std?.validate === "function"
  );
}

/**
 * Type-only schema: gives TypeScript a type with zero runtime validation.
 * `body: typed<{ name: string }>()`
 */
export function typed<T>(): ParseSchema<T> {
  return { parse: (data: unknown) => data as T };
}
