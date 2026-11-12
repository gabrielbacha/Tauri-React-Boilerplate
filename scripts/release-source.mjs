import { spawnSync } from "node:child_process";

export function releaseSource(root, tag, execute = spawnSync) {
  const git = (...args) => {
    const result = execute("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Cannot verify release source: git ${args[0]}`);
    return result.stdout.trim();
  };
  if (git("status", "--porcelain", "--untracked-files=all"))
    throw new Error("Publishing requires a clean source tree.");
  const commit = git("rev-parse", "HEAD");
  if (git("rev-parse", `${tag}^{commit}`) !== commit) throw new Error("Local release tag differs from built HEAD.");
  const refs = git("ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`).split("\n");
  const peeled = refs.find((line) => line.endsWith("^{}")) || refs[0];
  if (peeled.split(/\s/)[0] !== commit) throw new Error("Remote release tag differs from built HEAD.");
  return commit;
}
