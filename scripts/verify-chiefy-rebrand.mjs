#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function walk(relativePath, extensions, files = []) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return files;

  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    if (extensions.some((extension) => absolutePath.endsWith(extension))) {
      files.push(relativePath);
    }
    return files;
  }

  for (const entry of readdirSync(absolutePath)) {
    walk(path.join(relativePath, entry), extensions, files);
  }
  return files;
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    fail(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function assertJsonValue(relativePath, selector, expected) {
  const value = selector(readJson(relativePath));
  if (value !== expected) {
    fail(`${relativePath} expected ${JSON.stringify(expected)}, received ${JSON.stringify(value)}`);
  }
}

assertIncludes("astro.config.mjs", 'site: "https://chiefy.com"');
assertIncludes("src/utils/constants.ts", 'APP_URL = "https://app.chiefy.com"');
assertIncludes("src/utils/constants.ts", 'SUPPORT_EMAIL = "hello@chiefy.com"');
assertIncludes("src/layouts/BaseLayout.astro", 'content="Chiefy"');
assertIncludes("src/layouts/BaseLayout.astro", 'content="@ChiefyApp"');

assertJsonValue("src/i18n/content/home/en.json", (home) => home.meta.title, "Chiefy | AI chief of staff for Gmail and Outlook");
assertJsonValue("src/i18n/content/home/en.json", (home) => home.jsonLd.websiteName, "Chiefy");
assertJsonValue("src/i18n/messages/en.json", (messages) => messages["footer.tagline"], "Chiefy, formerly Duet Mail");
assertJsonValue("src/i18n/messages/en.json", (messages) => messages["footer.copyright"], "Chiefy © {year}");

const publicAssetExpectations = [
  "public/favicon.svg",
  "public/apple-touch-icon.png",
  "public/logo-combined.png",
  "public/logo-white.png",
  "public/og.jpg",
];
for (const relativePath of publicAssetExpectations) {
  if (!existsSync(path.join(repoRoot, relativePath))) {
    fail(`Missing Chiefy public asset: ${relativePath}`);
  }
}
assertIncludes("public/favicon.svg", "4530ea");

const sourceFiles = [
  "astro.config.mjs",
  "src/utils/constants.ts",
  ...walk("src/components", [".astro", ".ts"]),
  ...walk("src/layouts", [".astro"]),
  ...walk("src/pages", [".astro", ".ts"]),
  ...walk("src/i18n/content/home", [".json"]),
  ...walk("src/i18n/content/verticals", [".json"]),
  ...walk("src/i18n/messages", [".json"]),
  ...walk("src/content/blog", [".md"]),
];

const allowedFormerlyBridge = "Chiefy, formerly Duet Mail";
for (const relativePath of sourceFiles) {
  const content = read(relativePath).replaceAll(allowedFormerlyBridge, "");
  if (content.includes("Duet Mail")) {
    fail(`${relativePath} still contains visible Duet Mail product copy`);
  }
  if (content.includes("duetmail.com")) {
    fail(`${relativePath} still references duetmail.com`);
  }
  if (content.includes("@DuetMailApp")) {
    fail(`${relativePath} still references @DuetMailApp`);
  }
}

const legalFiles = walk("src/i18n/content/legal", [".html"]);
for (const relativePath of legalFiles) {
  const content = read(relativePath)
    .replaceAll("Duet Mail LLC", "")
    .replaceAll(allowedFormerlyBridge, "");
  if (content.includes("Duet Mail")) {
    fail(`${relativePath} contains Duet Mail outside the legal operator name`);
  }
  if (content.includes("duetmail.com")) {
    fail(`${relativePath} still references duetmail.com`);
  }
}

console.log("Chiefy rebrand verification passed");
