/**
 * Type-check `src/` against the Obsidian typings for the exact version
 * `manifest.json` promises.
 *
 * `package.json` asks for `obsidian: ^1.5.7`, which resolves to whatever the
 * latest 1.x is — 1.13.1 at the time of writing. So the everyday `tsc` run
 * checks against eight minor versions of API the manifest does not promise, and
 * nothing stops a future edit from using one and shipping a plugin that throws
 * on a vault at the declared floor. That is a promise to users with nothing
 * enforcing it; this script is the enforcement.
 *
 * Needs network access, so it is deliberately not part of `npm run build`.
 * Run it before a release, or whenever you reach for an API you are unsure of.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const floor = JSON.parse(readFileSync("manifest.json", "utf8")).minAppVersion;
if (typeof floor !== "string" || floor.length === 0) {
  console.error("manifest.json has no minAppVersion to check against.");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "ss-floor-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "pipe", encoding: "utf8" });

try {
  console.log(`Checking src/ against obsidian@${floor} typings…`);
  const packed = run("npm", ["pack", `obsidian@${floor}`, "--silent"], work).trim().split("\n").pop();
  run("tar", ["-xzf", packed], work);

  const typings = join(work, "package", "obsidian.d.ts");
  if (!existsSync(typings)) {
    console.error(`obsidian@${floor} does not ship obsidian.d.ts at package/obsidian.d.ts.`);
    process.exit(1);
  }

  // A tsconfig that keeps this repo's compiler settings but points `obsidian`
  // at the floor's typings instead of the installed ones.
  const base = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify(
      {
        ...base,
        compilerOptions: {
          ...base.compilerOptions,
          noEmit: true,
          baseUrl: process.cwd(),
          paths: { obsidian: [typings.replace(/\.d\.ts$/, "")] },
          typeRoots: [join(process.cwd(), "node_modules", "@types")],
        },
        include: [join(process.cwd(), "src", "**", "*.ts")],
      },
      null,
      2,
    ),
  );

  run(join(process.cwd(), "node_modules", ".bin", "tsc"), ["-p", join(work, "tsconfig.json")], work);
  console.log(`OK — every API src/ calls exists in Obsidian ${floor}.`);
} catch (error) {
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
  console.error(
    output ||
      `Failed to check against obsidian@${floor}. This script needs network access to fetch those typings.`,
  );
  console.error(
    `\nIf the errors above are missing APIs, either stop using them or raise minAppVersion past ${floor} in manifest.json and versions.json.`,
  );
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
