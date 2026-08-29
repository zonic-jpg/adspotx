#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SITE = "913fed63-eeb2-4974-b5f0-7f8833232f81";
const BUNDLE = "/tmp/adspotcl-bundle";
const config = JSON.parse(
  fs.readFileSync(path.join(process.env.HOME, "Library/Preferences/netlify/config.json"), "utf8"),
);
const TOKEN = config.users[config.userId].auth.token;

function sha1(filePath) {
  const h = crypto.createHash("sha1");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function walk(dir, base = dir, out = {}) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = "/" + path.relative(base, full).split(path.sep).join("/");
    if (fs.statSync(full).isDirectory()) walk(full, base, out);
    else out[rel] = sha1(full);
  }
  return out;
}

async function api(method, urlPath, body, rawBody) {
  const res = await fetch(`https://api.netlify.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(rawBody ? {} : { "Content-Type": "application/json" }),
    },
    body: rawBody ?? (body == null ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const files = walk(BUNDLE);
  console.log("files", Object.keys(files).length);
  const deploy = await api("POST", `/api/v1/sites/${SITE}/deploys`, { files });
  console.log("deploy", deploy.id, deploy.state, "required", (deploy.required || []).length);

  const required = new Set(deploy.required || []);
  for (const [rel, hash] of Object.entries(files)) {
    if (required.size && !required.has(hash) && !required.has(rel)) continue;
    const full = path.join(BUNDLE, rel.slice(1));
    const putUrl = `https://api.netlify.com/build/deploy/v1/deploy/${deploy.id}${rel}`;
    const res = await fetch(putUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
      body: fs.readFileSync(full),
    });
    if (!res.ok) throw new Error(`upload ${rel} -> ${res.status} ${await res.text()}`);
    console.log("uploaded", rel);
  }

  const done = await api("POST", `/api/v1/sites/${SITE}/deploys/${deploy.id}/restore`, {});
  console.log("DONE", done.state, done.ssl_url || done.url);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
