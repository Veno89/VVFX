import {
  defaultTypesDirectory,
  generateRuntimeTypes,
} from "./runtime-types.mjs";

await generateRuntimeTypes({
  outputDirectory: defaultTypesDirectory,
  clean: true,
});
