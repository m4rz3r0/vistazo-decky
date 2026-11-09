// Steam's internals change between client versions: read them through this so a throw, null or
// undefined becomes the given fallback instead of breaking a screen.
export function safe<T>(fn: () => T | null | undefined, fallback: T): T {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}
