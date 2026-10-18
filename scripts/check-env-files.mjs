import { execFileSync } from "node:child_process";
import { basename } from "node:path";

// Inspect names in Git's index, not file contents or the ignored local env.
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const forbidden = tracked.filter((filename) => {
  const name = basename(filename);
  return /^\.env(?:\.|$)/i.test(name) && !/^\.env(?:\..+)?\.example$/i.test(name);
});

if (forbidden.length) {
  console.error(
    "Runtime env files must not be tracked. Keep placeholder configuration in .env.example.",
  );
  for (const filename of forbidden) console.error(`- ${JSON.stringify(filename)}`);
  process.exitCode = 1;
} else {
  console.log("Tracked env check passed: only example env files are allowed.");
}
