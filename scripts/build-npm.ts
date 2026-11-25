import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const version = process.argv[2] ?? JSON.parse(readFileSync("./jsr.json", "utf-8")).version;

console.log("removing previous files..");
rmSync("./npm", { recursive: true, force: true });
mkdirSync("./npm", { recursive: true });

console.log("compiling stuff..");

const proc = Bun.spawnSync(
  [
    "bunx",
    "tsc",
    "src/hermes.ts",
    "--ignoreConfig",
    "--outDir",
    "./npm",
    "--declaration",
    "--target",
    "ESNext",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--lib",
    "ESNext,DOM,DOM.Iterable,DOM.AsyncIterable",
    "--types",
    "bun",
    "--allowImportingTsExtensions",
    "--rewriteRelativeImportExtensions",
    "--strict",
    "--skipLibCheck",
  ],
  { stdout: "inherit", stderr: "inherit" },
);

if (!proc.success) {
  throw new Error("tsc failed");
}

console.log("fixing declarations..");
Bun.spawnSync(["bun", "run", "./scripts/fix-dts.ts"], { stdout: "inherit", stderr: "inherit" });

console.log("writing package.json, version " + version + "...");

const pkg = {
  name: "@shevernitskiy/twitch-hermes",
  description: "Twitch Hermes websocket client",
  version: version,
  author: "shevernitskiy",
  license: "MIT",
  type: "module",
  private: false,
  engines: {
    node: ">= 22",
  },
  repository: {
    type: "git",
    url: "git+https://github.com/shevernitskiy/twitch-hermes.git",
  },
  files: ["*.js", "*.d.ts"],
  main: "./hermes.js",
  module: "./hermes.js",
  types: "./hermes.d.ts",
  exports: {
    ".": {
      types: "./hermes.d.ts",
      import: "./hermes.js",
      default: "./hermes.js",
    },
  },
  keywords: ["twitch", "pubsub", "websocket", "hermes", "client", "library"],
};
writeFileSync("./npm/package.json", JSON.stringify(pkg, null, 2) + "\n");

console.log("copy some stuff...");

copyFileSync("./README.md", "./npm/README.md");
copyFileSync("./LICENSE", "./npm/LICENSE");

console.log("all done!");
