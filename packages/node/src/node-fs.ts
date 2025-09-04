import fs from "node:fs";
import path from "node:path";
import { argv, chdir, cwd } from "node:process";
import { promisify } from "node:util";

import type { IBaseFileSystem, IFileSystem, WatchOptions } from "@file-services/types";
import { createFileSystem } from "@file-services/utils";
import { RecursiveFSWatcher } from "./recursive-fs-watcher.js";

const caseSensitive = !fs.existsSync(argv[0]!.toUpperCase());
const fsPromisesExists = promisify(fs.exists);

export function createNodeFs(): IFileSystem {
  return createFileSystem(createBaseNodeFs());
}

export function createBaseNodeFs(): IBaseFileSystem {
  const originalWatch = fs.watch;
  const watch = process.platform === "linux" ? wrapWithOwnRecursiveImpl(originalWatch) : originalWatch;
  return {
    ...path,
    chdir,
    cwd,
    caseSensitive,
    ...fs,
    watch,
    promises: {
      ...fs.promises,
      exists: fsPromisesExists,
    },
  };
}

function wrapWithOwnRecursiveImpl(originalWatch: typeof fs.watch) {
  return (targetPath: string, options?: WatchOptions) => {
    if (options?.recursive) {
      return new RecursiveFSWatcher(targetPath, options);
    }
    return originalWatch(targetPath, options);
  };
}
