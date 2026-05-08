import fs from "node:fs/promises";
import path from "node:path";

export const ensureDirectory = async (directoryPath) => {
  await fs.mkdir(directoryPath, { recursive: true });
  return directoryPath;
};

export const appendJsonLine = async (filePath, value) => {
  await ensureDirectory(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
};

export const writeTextFile = async (filePath, content) => {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
};

export const writeJsonFile = async (filePath, value) =>
  writeTextFile(filePath, JSON.stringify(value, null, 2));

export const sanitizeFileName = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "file";
