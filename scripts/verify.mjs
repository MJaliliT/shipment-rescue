import { spawnSync } from "node:child_process";
import fs from "node:fs";
const checks = [];
for (const command of ["test", "evaluate", "demo", "adaptive"]) {
  const start = Date.now();
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      ...(command === "test"
        ? [
            "--test",
            ...fs
              .readdirSync("tests")
              .filter((f) => f.endsWith(".test.ts"))
              .map((f) => "tests/" + f),
          ]
        : command === "evaluate"
          ? ["evaluation/run.ts"]
          : [
              "src/cli.ts",
              "demo",
              ...(command === "adaptive" ? ["--adaptive"] : []),
            ]),
    ],
    { stdio: "inherit", shell: false },
  );
  checks.push({
    command,
    passed: result.status === 0,
    elapsedMs: Date.now() - start,
  });
  if (result.status !== 0) {
    process.exitCode = 1;
    break;
  }
}
fs.mkdirSync("runs", { recursive: true });
fs.writeFileSync(
  "runs/verification.json",
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      synthetic: true,
      scope:
        "credential-free technical verification; not submission certification",
      checks,
    },
    null,
    2,
  ),
);
