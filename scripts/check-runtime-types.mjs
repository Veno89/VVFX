import { checkRuntimeTypes } from "./runtime-types.mjs";

const { changes, fileCount } = await checkRuntimeTypes();
if (changes.length > 0) {
  process.stderr.write(
    `Generated runtime declarations were stale:\n${changes.map((path) => `- ${path}`).join("\n")}\nCommit the regenerated result.\n`,
  );
  process.exit(1);
}

console.log(
  `Generated runtime declarations are current (${fileCount} files, checked without modifying the committed directory).`,
);
