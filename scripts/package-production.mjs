#!/usr/bin/env node
/** Production code zip — no .md docs (PDFs ship separately). Dated 22 July 2026 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(
  process.env.HOME ?? "/tmp",
  "Downloads",
  "adspotlatest22july.zip",
);

if (existsSync(out)) rmSync(out);

const cmd = [
  `cd "${ROOT}" &&`,
  `zip -r "${out}" .`,
  `-x "node_modules/*"`,
  `-x "*/node_modules/*"`,
  `-x "app/node_modules/*"`,
  `-x "server/node_modules/*"`,
  `-x "lib/*/node_modules/*"`,
  `-x ".git/*"`,
  `-x "**/.DS_Store"`,
  `-x "docs/*.md"`,
  `-x "STAGING_GUIDANCE.md"`,
  `-x "README.md"`,
  `-x "server/.env"`,
].join(" ");

execSync(cmd, { stdio: "inherit", shell: "/bin/bash" });
console.log(`\nProduction package: ${out}`);
