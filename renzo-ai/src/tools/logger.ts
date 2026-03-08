// MCP file logger — writes to logs/mcp-YYYY-MM-DD.log
// Also mirrors to stderr for MCP Inspector / debug visibility

import * as fs from "fs";
import * as path from "path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const LOG_DIR = path.resolve(process.cwd(), "logs");

// Set via LOG_LEVEL env var; defaults to "debug"
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "debug";

let currentDate = "";
let stream: fs.WriteStream | null = null;

function ensureStream(): fs.WriteStream {
  const today = new Date().toISOString().slice(0, 10);
  if (stream && currentDate === today) return stream;

  if (stream) stream.end();

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  currentDate = today;
  const logFile = path.join(LOG_DIR, `mcp-${today}.log`);
  stream = fs.createWriteStream(logFile, { flags: "a" });
  return stream;
}

function emit(level: LogLevel, message: string): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;
  const ts = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5);
  const line = `${ts} [${tag}] ${message}\n`;
  console.error(`[${tag}] ${message}`);
  ensureStream().write(line);
}

/** Standard log (info level) */
export function log(message: string): void {
  emit("info", message);
}

/** Debug log — verbose tracing, enabled when LOG_LEVEL=debug (default) */
export function debug(message: string): void {
  emit("debug", message);
}

/** Warning log */
export function warn(message: string): void {
  emit("warn", message);
}

export function closeLog(): void {
  if (stream) {
    stream.end();
    stream = null;
  }
}
