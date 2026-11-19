/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));
const sources = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
  .map((entry) => {
    const path = resolve(entry.parentPath, entry.name);
    return { path, source: readFileSync(path, "utf8") };
  });

it("only laneC.ts imports from outside the extras folder", () => {
  const violations = sources.flatMap(({ path, source }) => {
    if (relative(root, path) === "laneC.ts") return [];

    return ts.preProcessFile(source, true, true).importedFiles.flatMap(({ fileName }) => {
      const target = relative(root, resolve(dirname(path), fileName));
      const leavesExtras = fileName.startsWith(".") && (target === ".." || target.startsWith(`..${sep}`));
      return fileName === "@pls/engine" || leavesExtras || isAbsolute(fileName)
        ? [`${relative(root, path)}: ${fileName}`]
        : [];
    });
  });
  expect(violations).toEqual([]);
});

it("the guard walked at least 40 files", () => {
  expect(sources.length).toBeGreaterThanOrEqual(40);
});

const animationPackage = "anime" + "js";
const forbidden = [animationPackage, "getGenerative" + "Model", "Language" + "Model"];

it(`no extras file imports ${animationPackage} or calls a model`, () => {
  const violations = sources.flatMap(({ path, source }) =>
    forbidden.filter((token) => source.includes(token)).map((token) => `${relative(root, path)}: ${token}`),
  );
  expect(violations).toEqual([]);
});
