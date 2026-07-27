import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { expect, test } from "vitest";

test("emits a Node ESM coaching function whose complete module graph loads", async () => {
  const cacheRoot = resolve("node_modules/.cache");
  await mkdir(cacheRoot, { recursive: true });
  const outDir = await mkdtemp(join(cacheRoot, "vercel-esm-"));

  try {
    const program = ts.createProgram({
      rootNames: [resolve("api/coaching.ts")],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        outDir,
        rootDir: process.cwd(),
        skipLibCheck: true,
        noEmitOnError: true,
        strict: true,
      },
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((item) => item.category === ts.DiagnosticCategory.Error)
      .map((item) => ({
        file: item.file?.fileName,
        line:
          item.file && item.start !== undefined
            ? item.file.getLineAndCharacterOfPosition(item.start).line + 1
            : undefined,
        message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
      }));

    expect(diagnostics).toEqual([]);
    expect(program.emit().emitSkipped).toBe(false);
    await expect(
      import(
        `${pathToFileURL(join(outDir, "api/coaching.js")).href}?test=${Date.now()}`
      ),
    ).resolves.toMatchObject({ default: expect.any(Function) });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}, 30_000);
