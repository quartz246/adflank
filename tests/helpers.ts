import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetDb } from "@/lib/db";

/** Fresh SQLite file per test file. */
export function freshDb(): string {
  resetDb();
  const dir = mkdtempSync(path.join(os.tmpdir(), "adflank-test-"));
  process.env.DB_PATH = path.join(dir, "test.db");
  return process.env.DB_PATH;
}
