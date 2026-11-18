import { RegistryError } from "../errors/index.js";
import { isPlainTree } from "../registry/index.js";
import type { RegistryTree, UnionToIntersection } from "../types/index.js";

export interface ComposeOptions {
  /**
   * What to do when two trees define the same name:
   * - "error" (default): throw RegistryError with code REGISTRY_COLLISION
   * - "keep-first": keep the earliest definition
   * - "replace": the later definition wins (explicit opt-in)
   * Two groups with the same name are always merged recursively; the same endpoint object twice is a no-op.
   */
  onConflict?: "error" | "keep-first" | "replace";
}

function merge(
  target: Record<string, unknown>,
  source: RegistryTree,
  path: readonly string[],
  onConflict: NonNullable<ComposeOptions["onConflict"]>,
): void {
  for (const key of Object.keys(source)) {
    const here = [...path, key];
    const incoming = source[key];
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = isPlainTree(incoming)
        ? cloneTree(incoming, here, onConflict)
        : incoming;
      continue;
    }
    const existing = target[key];
    if (existing === incoming) continue;
    if (isPlainTree(existing) && isPlainTree(incoming)) {
      merge(existing as Record<string, unknown>, incoming, here, onConflict);
      continue;
    }
    if (onConflict === "keep-first") continue;
    if (onConflict === "replace") {
      target[key] = isPlainTree(incoming)
        ? cloneTree(incoming, here, onConflict)
        : incoming;
      continue;
    }
    throw new RegistryError(
      `Name collision at "${here.join(".")}" while composing registries`,
      {
        path: here.join("."),
        collision: true,
      },
    );
  }
}

function cloneTree(
  tree: RegistryTree,
  path: readonly string[],
  onConflict: NonNullable<ComposeOptions["onConflict"]>,
) {
  const out: Record<string, unknown> = {};
  merge(out, tree, path, onConflict);
  return out;
}

/**
 * Combines several endpoint trees into one, without global state and without silent replacement.
 * Pass the result to createRegistry().
 */
export function composeRegistry<const T extends readonly RegistryTree[]>(
  trees: T,
  options: ComposeOptions = {},
): UnionToIntersection<T[number]> {
  const onConflict = options.onConflict ?? "error";
  const out: Record<string, unknown> = {};
  trees.forEach((tree, index) => {
    if (!isPlainTree(tree))
      throw new RegistryError(
        `composeRegistry(): item ${index} is not a tree of endpoints`,
      );
    merge(out, tree, [], onConflict);
  });
  return out as UnionToIntersection<T[number]>;
}
