import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("runtime independence", () => {
  it("core does not reference window, document, process or Node-only modules", () => {
    const banned = /\b(window|document|process)\b|from ["']node:|require\(/;
    for (const file of files("src")) {
      const code = readFileSync(file, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      assert.ok(!banned.test(code), `${file} uses a runtime-specific API`);
    }
  });
  it("has no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    assert.equal(pkg.dependencies, undefined);
  });
  it("public API avoids `any`", () => {
    for (const file of files("src")) {
      const code = readFileSync(file, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      assert.ok(!/:\s*any\b|<any>|as any\b/.test(code), `${file} uses any`);
    }
  });
});
