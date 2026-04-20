import type {
  IBaseFileSystemPromiseActions,
  IBaseFileSystemSyncActions,
  IDirectoryEntry,
  IFileSystem,
  ReadFileOptions,
} from "@file-services/types";
import { createFileSystem } from "@file-services/utils";

const getEntryName = (item: IDirectoryEntry) => item.name;

export function createOverlayFs(
  lowerFs: IFileSystem,
  upperFs: IFileSystem,
  baseDirectoryPath = lowerFs.cwd(),
): IFileSystem {
  const { promises: lowerPromises } = lowerFs;
  const { promises: upperPromises } = upperFs;
  const lowerFsRelativeUp = `..${lowerFs.sep}`;

  // ensure base Directory is absolute
  baseDirectoryPath = lowerFs.resolve(baseDirectoryPath);

  function resolvePaths(path: string): { resolvedLowerPath: string; resolvedUpperPath?: string } {
    const resolvedLowerPath = lowerFs.resolve(path);
    const relativeToBase = lowerFs.relative(baseDirectoryPath, resolvedLowerPath);

    if (
      relativeToBase !== ".." &&
      !relativeToBase.startsWith(lowerFsRelativeUp) &&
      !lowerFs.isAbsolute(relativeToBase)
    ) {
      return { resolvedLowerPath, resolvedUpperPath: relativeToBase.replace(/\\/g, "/") };
    } else {
      return { resolvedLowerPath };
    }
  }

  function realpathSync(path: string) {
    const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
    if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
      const { stackTraceLimit } = Error;
      try {
        Error.stackTraceLimit = 0;
        return lowerFs.join(baseDirectoryPath, upperFs.realpathSync(resolvedUpperPath));
      } catch {
        /**/
      } finally {
        Error.stackTraceLimit = stackTraceLimit;
      }
    }
    return lowerFs.realpathSync(resolvedLowerPath);
  }

  realpathSync.native = function realpathSyncNative(path: string) {
    const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
    if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
      const { stackTraceLimit } = Error;
      try {
        Error.stackTraceLimit = 0;
        return lowerFs.join(baseDirectoryPath, upperFs.realpathSync.native(resolvedUpperPath));
      } catch {
        /**/
      } finally {
        Error.stackTraceLimit = stackTraceLimit;
      }
    }
    return lowerFs.realpathSync.native(resolvedLowerPath);
  };

  const baseSyncActions: Partial<IBaseFileSystemSyncActions> = {
    existsSync(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined) {
        return upperFs.existsSync(resolvedUpperPath) || lowerFs.existsSync(resolvedLowerPath);
      } else {
        return lowerFs.existsSync(resolvedLowerPath);
      }
    },
    readFileSync: function readFileSync(path, ...args) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        const { stackTraceLimit } = Error;
        try {
          Error.stackTraceLimit = 0;
          return upperFs.readFileSync(resolvedUpperPath, ...args);
        } catch {
          /**/
        } finally {
          Error.stackTraceLimit = stackTraceLimit;
        }
      }
      return lowerFs.readFileSync(resolvedLowerPath, ...args);
    } as IBaseFileSystemSyncActions["readFileSync"],
    statSync: function (path: string, ...args: []) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          const stats = upperFs.statSync(resolvedUpperPath, ...args);
          if (stats) {
            return stats;
          }
        } catch {
          /**/
        }
      }
      return lowerFs.statSync(resolvedLowerPath, ...args);
    },
    lstatSync: function lstatSync(path: string, ...args: []) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          const stats = upperFs.lstatSync(resolvedUpperPath, ...args);
          if (stats) {
            return stats;
          }
        } catch {
          /**/
        }
      }
      return lowerFs.lstatSync(resolvedLowerPath, ...args);
    },
    realpathSync,
    readlinkSync(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        const { stackTraceLimit } = Error;
        try {
          Error.stackTraceLimit = 0;
          return upperFs.readlinkSync(resolvedUpperPath);
        } catch {
          /**/
        } finally {
          Error.stackTraceLimit = stackTraceLimit;
        }
      }
      return lowerFs.readlinkSync(resolvedLowerPath);
    },
    readdirSync: ((path, options: { withFileTypes: true }) => {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        const { stackTraceLimit } = Error;
        try {
          Error.stackTraceLimit = 0;
          const resInUpper = upperFs.readdirSync(resolvedUpperPath, options);
          try {
            const resInLower = lowerFs.readdirSync(resolvedLowerPath, options);
            if (options !== null && typeof options === "object" && options.withFileTypes) {
              const namesInUpper = new Set<string>(resInUpper.map(getEntryName));
              return [...resInLower.filter((item) => !namesInUpper.has(item.name)), ...resInUpper];
            }
            return Array.from(new Set([...resInLower, ...resInUpper]));
          } catch {
            return resInUpper;
          }
        } catch {
          /**/
        } finally {
          Error.stackTraceLimit = stackTraceLimit;
        }
      }
      return lowerFs.readdirSync(resolvedLowerPath, options);
    }) as IBaseFileSystemSyncActions["readdirSync"],
  };

  const basePromiseActions: Partial<IBaseFileSystemPromiseActions> = {
    async exists(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined) {
        return (await upperPromises.exists(resolvedUpperPath)) || (await lowerPromises.exists(resolvedLowerPath));
      } else {
        return lowerPromises.exists(resolvedLowerPath);
      }
    },
    readFile: async function readFile(path: string, ...args: [ReadFileOptions]) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          return await upperPromises.readFile(resolvedUpperPath, ...args);
        } catch {
          /**/
        }
      }
      return lowerPromises.readFile(resolvedLowerPath, ...args);
    } as IBaseFileSystemPromiseActions["readFile"],
    async stat(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          return await upperPromises.stat(resolvedUpperPath);
        } catch {
          /**/
        }
      }
      return lowerPromises.stat(resolvedLowerPath);
    },
    async lstat(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          return await upperPromises.lstat(resolvedUpperPath);
        } catch {
          /**/
        }
      }
      return lowerPromises.lstat(resolvedLowerPath);
    },
    async realpath(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          return lowerFs.join(baseDirectoryPath, await upperPromises.realpath(resolvedUpperPath));
        } catch {
          /**/
        }
      }
      return lowerPromises.realpath(resolvedLowerPath);
    },
    async readlink(path) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          return await upperPromises.readlink(resolvedUpperPath);
        } catch {
          /**/
        }
      }
      return lowerPromises.readlink(resolvedLowerPath);
    },
    readdir: async function readdir(path: string, options: { withFileTypes: true }) {
      const { resolvedLowerPath, resolvedUpperPath } = resolvePaths(path);
      if (resolvedUpperPath !== undefined && upperFs.existsSync(resolvedUpperPath)) {
        try {
          const resInUpper = await upperPromises.readdir(resolvedUpperPath, options);
          try {
            const resInLower = await lowerPromises.readdir(resolvedLowerPath, options);
            if (options !== null && typeof options === "object" && options.withFileTypes) {
              const namesInUpper = new Set<string>(resInUpper.map(getEntryName));
              return [...resInLower.filter((item) => !namesInUpper.has(item.name)), ...resInUpper];
            }
            return Array.from(new Set([...resInLower, ...resInUpper]));
          } catch {
            /**/
          }
          return resInUpper;
        } catch {
          /**/
        }
      }
      return lowerPromises.readdir(resolvedLowerPath, options);
    } as IBaseFileSystemPromiseActions["readdir"],
  };

  return createFileSystem({
    ...lowerFs,
    ...baseSyncActions,
    promises: { ...lowerPromises, ...basePromiseActions },
  });
}

// to avoid having to include @types/node
interface TracedErrorConstructor extends ErrorConstructor {
  stackTraceLimit?: number;
}
declare let Error: TracedErrorConstructor;
