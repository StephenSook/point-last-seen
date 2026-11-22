// Writes or checks shared/test-vectors/phone-numbers-corpus.json from tools/vectors/phone_corpus.ts.
//   npx tsx tools/vectors/phone_corpus_cli.ts --write   regenerate the file after a rule change
//   npx tsx tools/vectors/phone_corpus_cli.ts --check   exit 1 unless the file is exactly what --write would write

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build, serialize } from "./phone_corpus";

const ROOT = new URL("../../", import.meta.url);
const CORPUS = new URL("shared/test-vectors/phone-numbers-corpus.json", ROOT);
const RULE = new URL("web/src/data/phoneNumbers.ts", ROOT);
const VECTORS = new URL("shared/test-vectors/phone-numbers.json", ROOT);

const rule = `sha256:${createHash("sha256").update(readFileSync(RULE)).digest("hex")}`;
const text = serialize(build(JSON.parse(readFileSync(VECTORS, "utf8")), rule));
const mode = process.argv[2];
if (mode === "--write") {
  writeFileSync(CORPUS, text);
  console.log(`wrote ${text.length} characters`);
} else if (mode === "--check") {
  let committed = "";
  try {
    committed = readFileSync(CORPUS, "utf8");
  } catch {
    committed = "";
  }
  if (committed !== text) {
    console.error("phone-numbers-corpus.json is not what the generator writes for this rule: run --write and commit it");
    process.exit(1);
  }
  console.log("phone-numbers-corpus.json matches");
} else {
  console.error("usage: phone_corpus_cli.ts --write | --check");
  process.exit(2);
}
