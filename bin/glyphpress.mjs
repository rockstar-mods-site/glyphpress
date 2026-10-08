#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || process.argv[2] || "8080";
const url = `http://localhost:${port}`;

const server = spawn(process.execPath, [join(root, ".output/server/index.mjs")], {
  stdio: "inherit",
  env: { ...process.env, PORT: port },
});

console.log(`Glyphpress running at ${url} (Ctrl+C to stop)`);

setTimeout(() => {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch {}
}, 1000);

server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => server.kill("SIGINT"));
