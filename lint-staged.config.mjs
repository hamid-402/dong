/**
 * Chunk eslint argv on Windows — a single lint-staged run with 200+ files
 * blows past CreateProcess command-line length (~8191).
 */
const CHUNK = 35;

export default {
  "*.{ts,tsx}": (files) => {
    const commands = [];
    for (let i = 0; i < files.length; i += CHUNK) {
      const slice = files.slice(i, i + CHUNK);
      commands.push(
        `eslint --fix --max-warnings=0 --no-warn-ignored ${slice.join(" ")}`,
      );
    }
    return commands;
  },
};
