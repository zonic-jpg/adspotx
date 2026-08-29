#!/usr/bin/env node
/** Staging zip — AdSpotX v1.0 release. Output: ~/Downloads/adspotxv1.0.zip */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const downloads = path.join(process.env.HOME ?? "/tmp", "Downloads");

const VERSION = "1.0.0";
const RELEASE_NAME = "adspotxv1.0";
const outPrimary = path.join(downloads, `${RELEASE_NAME}.zip`);
const outLatest = path.join(downloads, "adspotx-latest.zip");
const outAlt = path.join(downloads, "AdSpot-partner-portal-staging.zip");

// Copy version fix log to zip root for recipients
const fixLogSrc = path.join(ROOT, "docs/ADSPOTX-VERSION-FIX-LOG.md");
const fixLogRoot = path.join(ROOT, "ADSPOTX-VERSION-FIX-LOG.md");
if (existsSync(fixLogSrc)) {
  copyFileSync(fixLogSrc, fixLogRoot);
}

for (const out of [outPrimary, outLatest, outAlt]) {
  if (existsSync(out)) rmSync(out);
}

// Exclude heavy/regenerable dirs — recipient runs `npx pnpm@9 install`
const excludes = [
  `"node_modules/*"`,
  `"*/node_modules/*"`,
  `"**/node_modules/*"`,
  `".git/*"`,
  `"**/.DS_Store"`,
  `"**/.vite/*"`,
  `"**/tsconfig.tsbuildinfo"`,
  `"server/.env"`,
];

const cmd = [
  `cd "${ROOT}" &&`,
  `zip -r "${outPrimary}" .`,
  ...excludes.map((x) => `-x ${x}`),
].join(" ");

execSync(cmd, { stdio: "inherit", shell: "/bin/bash" });

if (!existsSync(outPrimary)) {
  console.error("Zip creation failed");
  process.exit(1);
}

// Convenience aliases
execSync(`cp "${outPrimary}" "${outLatest}"`, { shell: "/bin/bash" });
execSync(`cp "${outPrimary}" "${outAlt}"`, { shell: "/bin/bash" });

const size = execSync(`ls -lh "${outPrimary}"`, { encoding: "utf8" }).trim();
console.log(`\nAdSpotX v${VERSION} package: ${outPrimary}`);
console.log(`Also copied as:  ${outLatest}`);
console.log(`Also copied as:  ${outAlt}`);
console.log(size);
console.log("Includes: app/, server/, partner-portal/, lib/db/, docs/, scripts/, dist builds");
console.log("Version fix log: ADSPOTX-VERSION-FIX-LOG.md (root + docs/)");
console.log("Deploy guide: docs/ADSPOTX-DEPLOY-GUIDE.md");
console.log("On target: npx pnpm@9 install && npx pnpm@9 run build && pnpm start");
