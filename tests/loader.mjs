// Resolves `@/x` to ./src/x and hands .ts files to Node's built-in type stripping.
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = resolvePath(ROOT, "src", specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(candidate) && !candidate.endsWith("/")) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
