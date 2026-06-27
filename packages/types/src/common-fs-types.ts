export type BufferEncoding =
  "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex";

export interface StatSyncOptions {
  /**
   * Whether an exception will be thrown if no file system entry exists, rather than returning `undefined`.
   * @default true
   */
  throwIfNoEntry?: boolean;
}

export type WriteFileOptions =
  | {
      encoding?: BufferEncoding | null;
      mode?: number | string;
      flag?: string;
    }
  | BufferEncoding
  | null;

export type ReadFileOptions =
  | {
      encoding?: BufferEncoding | null;
      flag?: string;
    }
  | BufferEncoding
  | null;

export const FileSystemConstants = {
  /**
   * When passed as a flag to `copyFile` or `copyFileSync`,
   * causes operation to fail if destination already exists.
   */
  COPYFILE_EXCL: 1,
} as const;

export interface IDirectoryContents<T extends Uint8Array | string = string> {
  [nodeName: string]: T | IDirectoryContents<T>;
}

/**
 * Subset of the original `fs.Dirent` class.
 */
export interface IDirectoryEntry {
  /**
   * Base name of the entry.
   *
   * @example `package.json`
   */
  name: string;

  /**
   * Whether the entry points to a file.
   */
  isFile(): boolean;

  /**
   * Whether the entry points to a directory.
   */
  isDirectory(): boolean;

  /**
   * Whether the entry is a symbolic link.
   */
  isSymbolicLink(): boolean;
}

/**
 * Subset of the original `fs.Stats` interface
 */
export interface IFileSystemStats {
  /**
   * The timestamp indicating the creation time of this file.
   */
  birthtime: Date;

  /**
   * The timestamp indicating the last time the file status was changed.
   */
  ctime: Date;

  /**
   * The timestamp indicating the last time this file was modified.
   */
  mtime: Date;

  /**
   * Size in bytes. For files, this is the file content size.
   * For symbolic links, this is the byte length of the target path.
   * For directories, this is implementation-defined.
   */
  size: number;

  /**
   * is the path pointing to a file
   */
  isFile(): boolean;

  /**
   * is the path pointing to a directory
   */
  isDirectory(): boolean;

  /**
   * is the path pointing to a symbolic link
   */
  isSymbolicLink(): boolean;
}

/**
 * Descriptor object for an existing file system path.
 */
export interface IFileSystemDescriptor {
  /**
   * Base name of the file system node.
   *
   * @example 'package.json'
   */
  name: string;

  /**
   * Absolute path to the file system node.
   *
   * @example '/path/to/package.json'
   */
  path: string;
}

export interface IWalkOptions {
  /**
   * Optional file filtering function that receives a file descriptor and returns
   * whether it should be included in the result.
   *
   * @default true returned for all files.
   */
  filterFile?(pathDesc: IFileSystemDescriptor): boolean;

  /**
   * Optional directory filtering function that receives a directory descriptor and returns
   * whether it should be walked into.
   *
   * @default true returned for all directories.
   */
  filterDirectory?(pathDesc: IFileSystemDescriptor): boolean;
}

export interface RmOptions {
  /**
   * When `true`, exceptions will be ignored if `path` does not exist.
   * @default false
   */
  force?: boolean | undefined;

  /**
   * If `true`, perform a recursive directory removal.
   * @default false
   */
  recursive?: boolean | undefined;
}

export interface WatchOptions {
  /**
   * When watching a directory, also watch deeply nested children.
   * @default false
   */
  recursive?: boolean;
}

export type WatchChangeEventListener = (eventType: "change" | "rename", relativePath: string) => void;

export interface FSWatcher {
  /**
   * Stop watching for changes on the given `FSWatcher`. Once stopped, the `FSWatcher` object is no longer usable.
   */
  close(): void;

  on(event: "change", listener: WatchChangeEventListener): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;

  off(event: "change", listener: WatchChangeEventListener): this;
  off(event: "close", listener: () => void): this;
  off(event: "error", listener: (error: Error) => void): this;
}
