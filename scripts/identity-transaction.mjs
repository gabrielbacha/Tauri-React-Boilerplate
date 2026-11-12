/* eslint-disable no-await-in-loop -- Identity files are published and restored in sequence. */
import * as fs from "node:fs";
import { join, relative } from "node:path";

/** Keep original and candidate bytes until every identity replacement succeeds. */
export function publishIdentity(root, entries, io = fs) {
  const recovery = io.mkdtempSync(join(root, ".setup-recovery-"));
  const journal = entries.map(([path, contents], index) => ({
    path,
    contents,
    previous: io.existsSync(path),
    backup: join(recovery, `${index}.original`),
    staged: join(recovery, `${index}.candidate`),
    published: false,
  }));
  const saveJournal = () =>
    io.writeFileSync(
      join(recovery, "journal.json"),
      JSON.stringify(
        journal.map(({ contents: _contents, ...entry }) => entry),
        null,
        2,
      ),
      { flush: true },
    );
  try {
    saveJournal();
    for (const entry of journal) {
      if (entry.previous) {
        io.copyFileSync(entry.path, entry.backup, fs.constants.COPYFILE_EXCL);
        const fd = io.openSync(entry.backup, "r");
        try {
          io.fsyncSync(fd);
        } finally {
          io.closeSync(fd);
        }
      }
      io.writeFileSync(entry.staged, entry.contents, { flag: "wx", flush: true });
    }
    saveJournal();
    for (const entry of journal) {
      // Candidates are on the same filesystem. Rename publishes a complete file.
      io.renameSync(entry.staged, entry.path);
      entry.published = true;
      saveJournal();
    }
  } catch (cause) {
    const failures = [];
    for (const entry of journal.filter((candidate) => candidate.published)) {
      try {
        if (entry.previous) io.copyFileSync(entry.backup, entry.path);
        else io.unlinkSync(entry.path);
      } catch (error) {
        failures.push({ path: relative(root, entry.path), error });
      }
    }
    if (failures.length)
      throw new AggregateError(
        [cause, ...failures.map((failure) => failure.error)],
        `Setup recovery required for ${failures.map((failure) => failure.path).join(", ")}. Original files and journal: ${recovery}`,
        { cause },
      );
    // Retain the journal even after complete rollback: it also covers interruption before acknowledgement.
    throw new Error(`Setup failed; published files restored. Recovery copies: ${recovery}`, { cause });
  }
  io.rmSync(recovery, { recursive: true });
}
