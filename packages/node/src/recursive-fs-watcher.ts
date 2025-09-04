import EventEmitter, { once } from "node:events";
import { lstatSync, readdirSync, watch, type FSWatcher, type Stats, type WatchOptions } from "node:fs";
import path from "node:path";

export interface WatcherEvents {
  error: [error: Error];
  change: [eventType: "change" | "rename", relativePath: string];
  close: [];
}

export class RecursiveFSWatcher extends EventEmitter<WatcherEvents> {
  #directoryPathToWatcher = new Map<string, FSWatcher>();

  private rootDirectoryPath: string;
  private options: WatchOptions;

  constructor(rootDirectoryPath: string, options?: WatchOptions) {
    super();
    if (!options?.recursive) {
      throw new Error("RecursiveFSWatcher requires recursive option to be set");
    }
    this.rootDirectoryPath = rootDirectoryPath;
    this.options = { ...options, recursive: false };
    setImmediate(() => {
      this.#watchDirectoryDeep(rootDirectoryPath);
    });
  }

  close() {
    Promise.all(
      Array.from(this.#directoryPathToWatcher, async ([directoryPath, watcher]) => {
        this.#closeExistingWatcher(directoryPath, watcher);
        await once(watcher, "close");
      }),
    )
      .then(() => {
        this.emit("close");
      })
      .catch((e) => {
        this.emit("error", e as Error);
      });
  }

  #watchDirectoryDeep(directoryPath: string): void {
    this.#watchDirectory(directoryPath);
    try {
      for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          this.#watchDirectoryDeep(path.join(directoryPath, entry.name));
        }
      }
    } catch (e) {
      this.emit("error", e as Error);
    }
  }

  #watchDirectory(directoryPath: string): void {
    try {
      this.#closeExistingWatcher(directoryPath);
      const watcher = watch(directoryPath, this.options);
      watcher.on("change", (eventType, relativePath) => {
        if (typeof relativePath !== "string" || (eventType !== "change" && eventType !== "rename")) {
          return;
        }
        const eventPath = path.join(directoryPath, relativePath);
        this.emit("change", eventType, path.relative(this.rootDirectoryPath, eventPath));
        if (eventType === "rename") {
          this.#closeExistingWatcher(eventPath);
          if (this.#lstatSyncSafe(eventPath)?.isDirectory()) {
            this.#watchDirectoryDeep(eventPath);
          }
        }
      });
      watcher.on("error", (e) => {
        this.emit("error", e);
      });
      this.#directoryPathToWatcher.set(directoryPath, watcher);
    } catch (e) {
      this.emit("error", e as Error);
    }
  }

  #closeExistingWatcher(directoryPath: string, watcher?: FSWatcher) {
    const existingWatcher = watcher ?? this.#directoryPathToWatcher.get(directoryPath);
    if (existingWatcher) {
      this.#directoryPathToWatcher.delete(directoryPath);
      existingWatcher.removeAllListeners("change");
      existingWatcher.close();
    }
  }

  #lstatSyncSafe(targetPath: string): Stats | undefined {
    try {
      return lstatSync(targetPath, { throwIfNoEntry: false });
    } catch (e) {
      this.emit("error", e as Error);
      return undefined;
    }
  }
}
