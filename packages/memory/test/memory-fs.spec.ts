import { expect } from "chai";
import { sleep } from "promise-assist";
import { syncBaseFsContract, asyncBaseFsContract, syncFsContract, asyncFsContract } from "@file-services/test-kit";
import { createMemoryFs } from "@file-services/memory";

describe("In-memory File System Implementation", () => {
  const testProvider = () => {
    return {
      fs: createMemoryFs(),
      tempDirectoryPath: "/",
      [Symbol.dispose]() {},
    };
  };

  syncBaseFsContract(testProvider);
  asyncBaseFsContract(testProvider);
  syncFsContract(testProvider);
  asyncFsContract(testProvider);

  describe("path.resolve", () => {
    it("resolves non-absolute paths relative to root /", () => {
      const fs = createMemoryFs();

      expect(fs.resolve("test")).to.equal("/test");
      expect(fs.resolve("some/deep/path")).to.equal("/some/deep/path");
    });
  });

  describe("creating files", () => {
    it("fails overwriting the root directory with a file", () => {
      const fs = createMemoryFs();
      expect(() => fs.writeFileSync("/", "test")).to.throw("EISDIR");
    });
  });

  describe("stat size", () => {
    it("reports correct byte sizes for files, directories, and symlinks", () => {
      const encoder = new TextEncoder();

      const content = "🚀🚀🚀"; // 3 chars, 12 UTF-8 bytes
      const fileFs = createMemoryFs({ "/file": content });
      expect(fileFs.statSync("/file").size, "multi-byte UTF-8 string").to.equal(12);

      const dirFs = createMemoryFs({ "/dir": {} });
      expect(dirFs.statSync("/dir").size, "directory").to.equal(0);

      const targetPath = "/some/target/path";
      const symlinkFs = createMemoryFs();
      symlinkFs.symlinkSync(targetPath, "/link");
      expect(symlinkFs.lstatSync("/link").size, "symlink target byte length").to.equal(
        encoder.encode(targetPath).byteLength,
      );
    });
  });

  describe("creating directories", () => {
    it("fails creating the root", async () => {
      const fs = createMemoryFs();

      expect(fs.readdirSync("/")).to.eql([]);
      expect(() => fs.mkdirSync("/")).to.throw("EEXIST");
      expect(fs.readdirSync("/")).to.eql([]);
    });
  });

  // these behaviors cannot be tested consistently across OSs,
  // so we test them for the memory implementation separately
  describe("copying files/directories", () => {
    const sourceFilePath = "/file.txt";
    const emptyDirectoryPath = "/empty_dir";

    it("preserves birthtime and updates mtime", async () => {
      const fs = createMemoryFs({
        [sourceFilePath]: "test content",
        [emptyDirectoryPath]: {},
      });
      const sourceFileStats = fs.statSync(sourceFilePath);
      const destFilePath = fs.join(emptyDirectoryPath, "dest");

      await sleep(100); // postpone copying to ensure timestamps are different

      fs.copyFileSync(sourceFilePath, destFilePath);

      const destFileStats = fs.statSync(destFilePath);

      expect(sourceFileStats.birthtime).to.eql(destFileStats.birthtime);
      expect(sourceFileStats.mtime).to.not.be.eql(destFileStats.mtime);
    });

    it("fails if source is a directory", () => {
      const fs = createMemoryFs({
        [emptyDirectoryPath]: {},
      });

      expect(() => fs.copyFileSync(emptyDirectoryPath, "/some_other_folder")).to.throw("EISDIR");
    });

    it("fails if target is a directory", () => {
      const fs = createMemoryFs({
        [sourceFilePath]: "test content",
        [emptyDirectoryPath]: {},
      });

      expect(() => fs.copyFileSync(sourceFilePath, emptyDirectoryPath)).to.throw("EISDIR");
    });
  });
});
