// Local dev server launcher (node, no shell): NEXT_PUBLIC_MOCK=1 by default; NEXT_PUBLIC_MOCK=0 uses the chain.
import { spawn } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sweep = (dir) => {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    if (name.startsWith("._")) { try { rmSync(p, { force: true }); } catch {} continue; }
    try { if (statSync(p).isDirectory()) sweep(p); } catch {}
  }
};
sweep(join(root, ".next"));
const env = { ...process.env, NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? "1", PACK_SECRET: process.env.PACK_SECRET ?? "local-dev-secret" };
const child = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", "3117"], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
