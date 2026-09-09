import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keep mocked AI/storage tests in separate processes to isolate their globals.
const tests = [
  "business-design.test.ts",
  "business-coach-job.test.ts",
  "business-coach-concurrency.test.ts",
  "business-coach-attachment.test.ts",
  "coach-deck-context.test.ts",
];

for (const test of tests) {
  execFileSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL(test, import.meta.url))], {
    stdio: "inherit",
  });
}
