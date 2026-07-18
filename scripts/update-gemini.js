import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGeminiChangelog, GEMINI_CHANGELOG_URL } from "./sources/fetch-gemini.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "..");
const outputDirectory = path.join(projectRoot, "data");
const outputFile = path.join(outputDirectory, "gemini.json");
const temporaryFile = `${outputFile}.tmp`;
const minimumExpectedEntries = 20;

async function main() {
  const entries = await fetchGeminiChangelog();
  validateEntries(entries);

  const previous = await readExistingFile();
  const contentChanged = !previous || JSON.stringify(previous.items || []) !== JSON.stringify(entries);

  if (!contentChanged) {
    console.log(`Gemini changelog unchanged. ${entries.length} entries retained.`);
    return;
  }

  const payload = {
    providerId: "gemini",
    sourceUrl: GEMINI_CHANGELOG_URL,
    generatedAt: new Date().toISOString(),
    itemCount: entries.length,
    items: entries
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryFile, outputFile);

  const previousCount = previous && Array.isArray(previous.items) ? previous.items.length : 0;
  console.log(`Gemini changelog updated: ${previousCount} -> ${entries.length} entries.`);
}

function validateEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Gemini fetcher did not return an array.");
  }

  if (entries.length < minimumExpectedEntries) {
    throw new Error(
      `Gemini fetcher returned only ${entries.length} entries. ` +
      `Expected at least ${minimumExpectedEntries}; previous data was preserved.`
    );
  }

  const ids = new Set();

  entries.forEach(function (entry, index) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Gemini entry ${index} is invalid.`);
    }

    ["id", "title", "date", "summary", "sourceUrl"].forEach(function (field) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) {
        throw new Error(`Gemini entry ${index} is missing ${field}.`);
      }
    });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new Error(`Gemini entry ${index} has an invalid date: ${entry.date}`);
    }

    if (entry.title.trim().split(/\s+/).length > 5) {
      throw new Error(`Gemini entry ${index} title exceeds five words.`);
    }

    if (ids.has(entry.id)) {
      throw new Error(`Duplicate Gemini entry id detected: ${entry.id}`);
    }

    ids.add(entry.id);
  });
}

async function readExistingFile() {
  try {
    const content = await readFile(outputFile, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

main().catch(function (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
