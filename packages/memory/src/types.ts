import type {
  IBaseFileSystemAsync,
  IBaseFileSystemSync,
  IDirectoryEntry,
  IFileSystemAsync,
  IFileSystemStats,
  IFileSystemSync,
} from "@file-services/types";

export interface IMemFileSystem extends IFileSystemSync, IFileSystemAsync {
  root: IFsMemDirectoryNode;
}

export interface IBaseMemFileSystem extends IBaseFileSystemSync, IBaseFileSystemAsync {
  root: IFsMemDirectoryNode;
}

export interface IBaseMemFileSystemSync extends IBaseFileSystemSync {
  root: IFsMemDirectoryNode;
}

export interface IFsMemStatsEntry extends IFileSystemStats, IDirectoryEntry {}

export interface IFsMemNode {
  type: "file" | "dir" | "symlink";
  entry: IFsMemStatsEntry;
}

export type IFsMemNodeType = IFsMemFileNode | IFsMemDirectoryNode | IFsMemSymlinkNode;

export interface IFsMemFileNode extends IFsMemNode {
  type: "file";
  contents: Uint8Array;
}

export interface IFsMemDirectoryNode extends IFsMemNode {
  type: "dir";
  contents: Map<string, IFsMemNodeType>;
}

export interface IFsMemSymlinkNode extends IFsMemNode {
  type: "symlink";
  target: string;
}
