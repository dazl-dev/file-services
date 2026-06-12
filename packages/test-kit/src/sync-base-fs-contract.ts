import { FileSystemConstants, type IBaseFileSystemSync } from "@file-services/types";
import { expect } from "chai";
import { sleep, waitFor } from "promise-assist";
import type { ITestInput } from "./types.js";

const SAMPLE_CONTENT = "content";
const DIFFERENT_CONTENT = "another content";

export function syncBaseFsContract(
  testProvider: () => ITestInput<IBaseFileSystemSync>,
  supportsRecursiveWatch = true,
): void {
  describe("SYNC file system contract", () => {
    describe("writing files", () => {
      it("can write a new file into an existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(filePath, SAMPLE_CONTENT);

        expect(fs.statSync(filePath).isFile()).to.equal(true);
        expect(fs.readFileSync(filePath, "utf8")).to.eql(SAMPLE_CONTENT);
      });

      it("can write a binary file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");
        const BINARY_CONTENT = new Uint8Array([1, 2, 3, 4, 5]);
        fs.writeFileSync(filePath, BINARY_CONTENT);

        expect(fs.statSync(filePath).isFile()).to.equal(true);
        const readBackContents = fs.readFileSync(filePath);
        expect(readBackContents).to.be.instanceOf(Uint8Array);
        expect(readBackContents).to.eql(BINARY_CONTENT);
        readBackContents[0] = 5;
        BINARY_CONTENT[0] = 5;
        expect(fs.readFileSync(filePath)).to.eql(new Uint8Array([1, 2, 3, 4, 5]));
      });

      it("can overwrite an existing file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        fs.writeFileSync(filePath, DIFFERENT_CONTENT);

        expect(fs.statSync(filePath).isFile()).to.equal(true);
        expect(fs.readFileSync(filePath, "utf8")).to.eql(DIFFERENT_CONTENT);
      });

      it("fails if writing a file to a non-existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "missing-dir", "file");

        const expectedToFail = () => fs.writeFileSync(filePath, SAMPLE_CONTENT);

        expect(expectedToFail).to.throw("ENOENT");
      });

      it("fails if writing a file to a path already pointing to a directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "dir");

        fs.mkdirSync(directoryPath);
        const expectedToFail = () => fs.writeFileSync(directoryPath, SAMPLE_CONTENT);

        expect(expectedToFail).to.throw("EISDIR");
      });

      it("fails if writing to a file without a name", () => {
        using testInput = testProvider();
        const { fs } = testInput;
        expect(() => fs.writeFileSync("", SAMPLE_CONTENT)).to.throw("ENOENT");
      });
    });

    it("stat size reflects the byte size of written content", () => {
      using testInput = testProvider();
      const { fs, tempDirectoryPath } = testInput;
      const filePath = fs.join(tempDirectoryPath, "file");
      const SAMPLE_CONTENT = "🚀";
      const DIFFERENT_CONTENT = "🚀🚀";
      const binaryContent = new Uint8Array([1, 2, 3, 4, 5]);
      const encoder = new TextEncoder();

      fs.writeFileSync(filePath, SAMPLE_CONTENT);
      expect(fs.statSync(filePath).size, "string content").to.equal(encoder.encode(SAMPLE_CONTENT).byteLength);

      fs.writeFileSync(filePath, DIFFERENT_CONTENT);
      expect(fs.statSync(filePath).size, "overwritten content").to.equal(encoder.encode(DIFFERENT_CONTENT).byteLength);

      fs.writeFileSync(filePath, binaryContent);
      expect(fs.statSync(filePath).size, "binary content").to.equal(binaryContent.byteLength);

      // directory size is implementation-defined; only assert it is a number
      expect(fs.statSync(tempDirectoryPath).size, "directory").to.be.a("number");
    });

    describe("reading files", () => {
      it("can read the contents of a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const firstFilePath = fs.join(tempDirectoryPath, "first-file");
        const secondFilePath = fs.join(tempDirectoryPath, "second-file");

        fs.writeFileSync(firstFilePath, SAMPLE_CONTENT);
        fs.writeFileSync(secondFilePath, DIFFERENT_CONTENT);

        expect(fs.readFileSync(firstFilePath, "utf8"), "contents of first-file").to.eql(SAMPLE_CONTENT);
        expect(fs.readFileSync(secondFilePath, "utf8"), "contents of second-file").to.eql(DIFFERENT_CONTENT);
        expect(fs.readFileSync(firstFilePath), "binary contents of first-file").to.be.instanceOf(Uint8Array);
      });

      it("fails if reading a non-existing file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const filePath = fs.join(tempDirectoryPath, "missing-file");
        expect(() => fs.readFileSync(filePath, "utf8")).to.throw("ENOENT");
      });

      it("fails if reading a directory as a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        expect(() => fs.readFileSync(tempDirectoryPath, "utf8")).to.throw("EISDIR");
      });
    });

    describe("removing files", () => {
      it("can remove files", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const filePath = fs.join(tempDirectoryPath, "file");
        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        fs.unlinkSync(filePath);
        expect(fs.statSync(filePath, { throwIfNoEntry: false })).to.equal(undefined);
      });

      it("fails if trying to remove a non-existing file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const filePath = fs.join(tempDirectoryPath, "missing-file");
        expect(() => fs.unlinkSync(filePath)).to.throw("ENOENT");
      });

      it("fails if trying to remove a directory as a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const directoryPath = fs.join(tempDirectoryPath, "dir");
        fs.mkdirSync(directoryPath);
        expect(() => fs.unlinkSync(directoryPath)).to.throw(); // linux throws `EISDIR`, mac throws `EPERM`
      });
    });

    describe("watching files", function () {
      const timeout = 5_000;
      this.timeout(timeout * 1.5);

      it("emits 'change' event when a watched file changes", async () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const testFilePath = fs.join(tempDirectoryPath, "test-file");
        fs.writeFileSync(testFilePath, SAMPLE_CONTENT);
        const watcher = fs.watch(testFilePath);
        using _ = { [Symbol.dispose]: () => watcher.close() };

        const watchEvents: Array<{ type: string; relativePath: string }> = [];
        watcher.on("change", (type, relativePath) => watchEvents.push({ type, relativePath }));
        fs.writeFileSync(testFilePath, DIFFERENT_CONTENT);

        await waitFor(
          () => {
            const [firstEvent] = watchEvents;
            expect(firstEvent).to.eql({ type: "change", relativePath: "test-file" });
          },
          { timeout },
        );
      });

      it("emits 'rename' event when a watched file is removed", async () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const testFilePath = fs.join(tempDirectoryPath, "test-file");
        fs.writeFileSync(testFilePath, SAMPLE_CONTENT);
        const watcher = fs.watch(testFilePath);
        using _ = { [Symbol.dispose]: () => watcher.close() };

        const watchEvents: Array<{ type: string; relativePath: string }> = [];
        watcher.on("change", (type, relativePath) => watchEvents.push({ type, relativePath }));
        fs.unlinkSync(testFilePath);

        await waitFor(
          () => {
            const lastEvent = watchEvents[watchEvents.length - 1];
            expect(lastEvent).to.eql({ type: "rename", relativePath: "test-file" });
          },
          { timeout },
        );
      });

      it("emits 'change' event when a file is changed in a watched directory", async () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const testFilePath = fs.join(tempDirectoryPath, "test-file");
        fs.writeFileSync(testFilePath, SAMPLE_CONTENT);
        const watcher = fs.watch(tempDirectoryPath);
        using _ = { [Symbol.dispose]: () => watcher.close() };

        const watchEvents: Array<{ type: string; relativePath: string }> = [];
        watcher.on("change", (type, relativePath) => watchEvents.push({ type, relativePath }));
        fs.writeFileSync(testFilePath, DIFFERENT_CONTENT);

        await waitFor(
          () => {
            const [firstEvent] = watchEvents;

            expect(firstEvent).to.eql({ type: "change", relativePath: "test-file" });
          },
          { timeout },
        );
      });

      if (supportsRecursiveWatch) {
        it("emits 'change' event when a deeply nested file is changed in a watched directory (when recursive)", async () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;
          const testFilePath = fs.join(tempDirectoryPath, "test-file");
          const nestedDirectoryPath = fs.join(tempDirectoryPath, "nested");
          const deeplyNestedPath = fs.join(nestedDirectoryPath, "deep-file");
          fs.writeFileSync(testFilePath, SAMPLE_CONTENT);
          fs.mkdirSync(nestedDirectoryPath);
          fs.writeFileSync(deeplyNestedPath, SAMPLE_CONTENT);

          const watcher = fs.watch(tempDirectoryPath, { recursive: true });
          using _ = { [Symbol.dispose]: () => watcher.close() };

          // recursive watcher needs some time to set up. don't seem to have event to wait for.
          await sleep(500);

          const watchEvents: Array<{ type: string; relativePath: string }> = [];
          watcher.on("change", (type, relativePath) => watchEvents.push({ type, relativePath }));

          fs.writeFileSync(deeplyNestedPath, DIFFERENT_CONTENT);

          await waitFor(
            () => {
              const lastEvent = watchEvents[watchEvents.length - 1];
              expect(lastEvent).to.eql({ type: "change", relativePath: fs.normalize("nested/deep-file") });
            },
            { timeout },
          );
        });
      }

      it("emits 'rename' event when a file is removed in a watched directory", async () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const testFilePath = fs.join(tempDirectoryPath, "test-file");
        fs.writeFileSync(testFilePath, SAMPLE_CONTENT);
        const watcher = fs.watch(tempDirectoryPath);
        using _ = { [Symbol.dispose]: () => watcher.close() };

        const watchEvents: Array<{ type: string; relativePath: string }> = [];
        watcher.on("change", (type, relativePath) => watchEvents.push({ type, relativePath }));
        fs.unlinkSync(testFilePath);

        await waitFor(() => expect(watchEvents).to.eql([{ type: "rename", relativePath: "test-file" }]), { timeout });
      });

      it("emits 'rename' event when a file is added in a watched directory", async () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const testFilePath = fs.join(tempDirectoryPath, "test-file");
        const watcher = fs.watch(tempDirectoryPath);
        using _ = { [Symbol.dispose]: () => watcher.close() };

        const watchEvents: Array<{ type: string; relativePath: string }> = [];
        watcher.on("change", (type, relativePath) => watchEvents.push({ type, relativePath }));
        fs.writeFileSync(testFilePath, SAMPLE_CONTENT);

        await waitFor(
          () => {
            const [firstEvent] = watchEvents;
            expect(firstEvent).to.eql({ type: "rename", relativePath: "test-file" });
          },
          { timeout },
        );
      });
    });

    describe("creating directories", () => {
      it("can create an empty directory inside an existing one", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "new-dir");

        fs.mkdirSync(directoryPath);

        expect(fs.statSync(directoryPath).isDirectory()).to.equal(true);
        expect(fs.readdirSync(directoryPath)).to.eql([]);
      });

      it("fails if creating in a path pointing to an existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "dir");

        fs.mkdirSync(directoryPath);
        const expectedToFail = () => fs.mkdirSync(directoryPath);

        expect(expectedToFail).to.throw("EEXIST");
      });

      it("fails if creating in a path pointing to an existing file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        const expectedToFail = () => fs.mkdirSync(filePath);

        expect(expectedToFail).to.throw("EEXIST");
      });

      it("fails if creating a directory inside a non-existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "outer", "inner");

        const expectedToFail = () => fs.mkdirSync(directoryPath);

        expect(expectedToFail).to.throw("ENOENT");
      });

      it("fails if creating a directory inside of a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        const expectedToFail = () => fs.mkdirSync(fs.join(filePath, "dir"));

        expect(expectedToFail).to.throw(/ENOTDIR|ENOENT/); // posix / windows
      });

      describe("recursively", () => {
        it("can create an empty directory inside an existing one", () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;
          const directoryPath = fs.join(tempDirectoryPath, "new-dir");

          fs.mkdirSync(directoryPath, { recursive: true });

          expect(fs.statSync(directoryPath).isDirectory()).to.equal(true);
          expect(fs.readdirSync(directoryPath)).to.eql([]);
        });

        it("creates parent directory chain when possible", () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;
          const directoryPath = fs.join(tempDirectoryPath, "missing", "also-missing", "new-dir");

          fs.mkdirSync(directoryPath, { recursive: true });

          expect(fs.statSync(directoryPath).isDirectory()).to.equal(true);
          expect(fs.readdirSync(directoryPath)).to.eql([]);
        });

        it("succeeds if creating in a path pointing to an existing directory", () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;
          const directoryPath = fs.join(tempDirectoryPath, "dir");
          fs.mkdirSync(directoryPath);

          expect(() => fs.mkdirSync(directoryPath, { recursive: true })).to.not.throw();
        });

        it("fails if creating in a path pointing to an existing file", () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;
          const filePath = fs.join(tempDirectoryPath, "file");
          fs.writeFileSync(filePath, SAMPLE_CONTENT);

          expect(() => fs.mkdirSync(filePath, { recursive: true })).to.throw("EEXIST");
        });

        it("fails if creating a directory inside of a file", () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;
          const filePath = fs.join(tempDirectoryPath, "file");
          fs.writeFileSync(filePath, SAMPLE_CONTENT);

          expect(() => fs.mkdirSync(fs.join(filePath, "dir"), { recursive: true })).to.throw("ENOTDIR");
        });
      });
    });

    describe("listing directories", () => {
      it("can list an existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "dir");

        fs.mkdirSync(directoryPath);
        fs.writeFileSync(fs.join(directoryPath, "file1"), SAMPLE_CONTENT);
        fs.writeFileSync(fs.join(directoryPath, "camelCasedName"), SAMPLE_CONTENT);

        expect(fs.readdirSync(tempDirectoryPath)).to.eql(["dir"]);
        const directoryContents = fs.readdirSync(directoryPath);
        expect(directoryContents).to.have.lengthOf(2);
        expect(directoryContents).to.contain("file1");
        expect(directoryContents).to.contain("camelCasedName");
      });

      it("lists directory entries", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        fs.mkdirSync(fs.join(tempDirectoryPath, "dir"));
        fs.writeFileSync(fs.join(tempDirectoryPath, "file"), SAMPLE_CONTENT);

        const directoryContents = fs.readdirSync(tempDirectoryPath, { withFileTypes: true });

        expect(directoryContents).to.have.lengthOf(2);
        const [firstItem, secondItem] = directoryContents;

        expect(firstItem?.name).to.equal("dir");
        expect(firstItem?.isDirectory()).to.equal(true);
        expect(firstItem?.isFile()).to.equal(false);

        expect(secondItem?.name).to.equal("file");
        expect(secondItem?.isDirectory()).to.equal(false);
        expect(secondItem?.isFile()).to.equal(true);
      });

      it("fails if listing a non-existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "missing-dir");

        const expectedToFail = () => fs.readdirSync(directoryPath);

        expect(expectedToFail).to.throw("ENOENT");
      });

      it("fails if listing a path pointing to a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        const expectedToFail = () => fs.readdirSync(filePath);

        expect(expectedToFail).to.throw("ENOTDIR");
      });
    });

    describe("removing directories", () => {
      it("can remove an existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "dir");

        fs.mkdirSync(directoryPath);
        fs.rmdirSync(directoryPath);

        expect(fs.statSync(directoryPath, { throwIfNoEntry: false })).to.equal(undefined);
      });

      it("fails if removing a non-empty directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "dir");

        fs.mkdirSync(directoryPath);
        fs.writeFileSync(fs.join(directoryPath, "file"), SAMPLE_CONTENT);
        const expectedToFail = () => fs.rmdirSync(directoryPath);

        expect(expectedToFail).to.throw("ENOTEMPTY");
      });

      it("fails if removing a non-existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const directoryPath = fs.join(tempDirectoryPath, "missing-dir");

        const expectedToFail = () => fs.rmdirSync(directoryPath);

        expect(expectedToFail).to.throw("ENOENT");
      });

      it("fails if removing a path pointing to a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        const expectedToFail = () => fs.rmdirSync(filePath);

        expect(expectedToFail).to.throw();
      });
    });

    describe("renaming directories and files", () => {
      it("moves a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const sourcePath = fs.join(tempDirectoryPath, "file");
        const destinationPath = fs.join(tempDirectoryPath, "dir", "subdir", "movedFile");

        fs.writeFileSync(sourcePath, SAMPLE_CONTENT);
        fs.mkdirSync(fs.join(tempDirectoryPath, "dir"));
        fs.mkdirSync(fs.join(tempDirectoryPath, "dir", "subdir"));

        fs.renameSync(sourcePath, destinationPath);

        expect(fs.statSync(destinationPath).isFile()).to.equal(true);
        expect(fs.readFileSync(destinationPath, "utf8")).to.eql(SAMPLE_CONTENT);
        expect(fs.statSync(sourcePath, { throwIfNoEntry: false })).to.equal(undefined);
      });

      it("updates mtime", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const sourcePath = fs.join(tempDirectoryPath, "file");
        const destinationPath = fs.join(tempDirectoryPath, "file2");

        fs.writeFileSync(sourcePath, SAMPLE_CONTENT);
        const sourceMtime = fs.statSync(sourcePath).mtime;
        fs.renameSync(sourcePath, destinationPath);

        expect(fs.statSync(destinationPath).mtime).not.to.equal(sourceMtime);
      });

      it(`throws if source path doesn't exist`, () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const sourcePath = fs.join(tempDirectoryPath, "file");

        expect(() => fs.renameSync(sourcePath, fs.join(tempDirectoryPath, "file2"))).to.throw("ENOENT");
      });

      it(`throws if the containing directory of the source path doesn't exist`, () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const sourcePath = fs.join(tempDirectoryPath, "unicorn", "file");

        expect(() => fs.renameSync(sourcePath, fs.join(tempDirectoryPath, "file2"))).to.throw("ENOENT");
      });

      it(`throws if destination containing path doesn't exist`, () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const sourcePath = fs.join(tempDirectoryPath, "file");

        fs.writeFileSync(sourcePath, SAMPLE_CONTENT);

        expect(() => fs.renameSync(sourcePath, fs.join(tempDirectoryPath, "dir", "file2"))).to.throw("ENOENT");
      });

      it("updates the parent directory of a renamed entry", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const sourcePath = fs.join(tempDirectoryPath, "sourceDir");
        const destPath = fs.join(tempDirectoryPath, "destDir");

        fs.mkdirSync(sourcePath);
        fs.writeFileSync(fs.join(sourcePath, "file"), SAMPLE_CONTENT);

        fs.renameSync(sourcePath, destPath);

        expect(fs.readdirSync(tempDirectoryPath)).to.include("destDir");
      });

      describe("renaming directories", () => {
        it("allows renaming a complex directory structure to another destination", () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;

          const sourcePath = fs.join(tempDirectoryPath, "dir");
          const destinationPath = fs.join(tempDirectoryPath, "anotherDir", "subdir", "movedDir");
          fs.mkdirSync(fs.join(tempDirectoryPath, "dir"));
          fs.mkdirSync(fs.join(tempDirectoryPath, "anotherDir"));
          fs.mkdirSync(fs.join(tempDirectoryPath, "anotherDir", "subdir"));
          fs.writeFileSync(fs.join(sourcePath, "file"), SAMPLE_CONTENT);

          fs.renameSync(sourcePath, destinationPath);

          expect(fs.statSync(destinationPath).isDirectory()).to.equal(true);
          expect(fs.readFileSync(fs.join(destinationPath, "file"), "utf8")).to.eql(SAMPLE_CONTENT);
          expect(fs.statSync(sourcePath, { throwIfNoEntry: false })).to.equal(undefined);
        });

        it(`allows renaming a directory over a non-existing directory`, () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;

          const sourcePath = fs.join(tempDirectoryPath, "sourceDir");

          fs.mkdirSync(sourcePath);
          fs.writeFileSync(fs.join(sourcePath, "file"), SAMPLE_CONTENT);

          expect(() => fs.renameSync(sourcePath, fs.join(tempDirectoryPath, "destDir"))).not.to.throw("EEXIST");
        });

        it(`allows renaming a directory over an empty directory`, () => {
          using testInput = testProvider();
          const { fs, tempDirectoryPath } = testInput;

          const sourcePath = fs.join(tempDirectoryPath, "sourceDir");
          const destPath = fs.join(tempDirectoryPath, "destDir");

          fs.mkdirSync(sourcePath);
          fs.mkdirSync(destPath);
          fs.writeFileSync(fs.join(sourcePath, "file"), SAMPLE_CONTENT);

          expect(() => fs.renameSync(sourcePath, destPath)).not.to.throw("EEXIST");
        });
      });
    });

    it("correctly exposes whether it is case sensitive", () => {
      using testInput = testProvider();
      const { fs, tempDirectoryPath } = testInput;

      const filePath = fs.join(tempDirectoryPath, "file");
      const upperCaseFilePath = filePath.toUpperCase();

      fs.writeFileSync(filePath, SAMPLE_CONTENT);

      if (fs.caseSensitive) {
        expect(fs.statSync(upperCaseFilePath, { throwIfNoEntry: false })).to.equal(undefined);
      } else {
        expect(fs.statSync(upperCaseFilePath).isFile()).to.equal(true);
      }
    });

    describe("copying files/directories", () => {
      const SOURCE_FILE_NAME = "file.txt";

      it("can copy file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetDirectoryPath = fs.join(tempDirectoryPath, "dir");
        fs.mkdirSync(targetDirectoryPath);
        const sourceFilePath = fs.join(tempDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(sourceFilePath, SAMPLE_CONTENT);

        const targetPath = fs.join(targetDirectoryPath, SOURCE_FILE_NAME);
        fs.copyFileSync(sourceFilePath, targetPath);
        expect(fs.readFileSync(targetPath, "utf8")).to.be.eql(SAMPLE_CONTENT);
      });

      it("fails if source does not exist", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetDirectoryPath = fs.join(tempDirectoryPath, "dir");
        fs.mkdirSync(targetDirectoryPath);
        const sourceFilePath = fs.join(tempDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(sourceFilePath, SAMPLE_CONTENT);

        const sourcePath = fs.join(tempDirectoryPath, "nonExistingFileName.txt");
        const targetPath = fs.join(targetDirectoryPath, SOURCE_FILE_NAME);
        expect(() => fs.copyFileSync(sourcePath, targetPath)).to.throw("ENOENT");
      });

      it("fails if target containing directory does not exist", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetDirectoryPath = fs.join(tempDirectoryPath, "dir");
        fs.mkdirSync(targetDirectoryPath);
        const sourceFilePath = fs.join(tempDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(sourceFilePath, SAMPLE_CONTENT);

        const targetPath = fs.join(targetDirectoryPath, "nonExistingDirectory", SOURCE_FILE_NAME);
        expect(() => fs.copyFileSync(sourceFilePath, targetPath)).to.throw("ENOENT");
      });

      it("overwrites destination file by default", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetDirectoryPath = fs.join(tempDirectoryPath, "dir");
        fs.mkdirSync(targetDirectoryPath);
        const sourceFilePath = fs.join(tempDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(sourceFilePath, SAMPLE_CONTENT);

        const targetPath = fs.join(targetDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(targetPath, "content to be overwritten");
        fs.copyFileSync(sourceFilePath, targetPath);
        expect(fs.readFileSync(targetPath, "utf8")).to.be.eql(SAMPLE_CONTENT);
      });

      it("fails if destination exists and flag COPYFILE_EXCL passed", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetDirectoryPath = fs.join(tempDirectoryPath, "dir");
        fs.mkdirSync(targetDirectoryPath);
        const sourceFilePath = fs.join(tempDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(sourceFilePath, SAMPLE_CONTENT);

        const targetPath = fs.join(targetDirectoryPath, SOURCE_FILE_NAME);
        fs.writeFileSync(targetPath, "content to be overwritten");
        expect(() => fs.copyFileSync(sourceFilePath, targetPath, FileSystemConstants.COPYFILE_EXCL)).to.throw("EEXIST");
      });
    });

    describe("symlinks", () => {
      const TARGET_NAME = "target";
      const LINK_NAME = "link";

      it("creates a link to a file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        fs.writeFileSync(targetPath, SAMPLE_CONTENT);

        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        fs.symlinkSync(targetPath, linkPath);

        expect(fs.readFileSync(linkPath, "utf8")).to.eq(SAMPLE_CONTENT);
        const stats = fs.statSync(linkPath);
        expect(stats.isFile()).to.equal(true);
        expect(stats.isSymbolicLink()).to.equal(false);
        expect(stats.mtime.getTime()).to.equal(fs.statSync(targetPath).mtime.getTime());
        const lstats = fs.lstatSync(linkPath);
        expect(lstats.isFile()).to.equal(false);
        expect(lstats.isSymbolicLink()).to.equal(true);
      });

      it("creates a link to a directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        const innerDirectoryPath = fs.join(targetPath, "inner-dir");
        fs.mkdirSync(targetPath);
        fs.mkdirSync(innerDirectoryPath);
        fs.writeFileSync(fs.join(targetPath, "file-in-target"), SAMPLE_CONTENT);
        fs.writeFileSync(fs.join(innerDirectoryPath, "file-in-inner"), SAMPLE_CONTENT);

        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        fs.symlinkSync(targetPath, linkPath, "junction");

        expect(fs.readFileSync(fs.join(linkPath, "file-in-target"), "utf8")).to.eq(SAMPLE_CONTENT);
        expect(fs.readdirSync(linkPath).sort()).to.eql(["file-in-target", "inner-dir"]);
        expect(fs.readFileSync(fs.join(linkPath, "inner-dir", "file-in-inner"), "utf8")).to.eq(SAMPLE_CONTENT);
        expect(fs.readdirSync(fs.join(linkPath, "inner-dir"))).to.eql(["file-in-inner"]);
        const stats = fs.statSync(linkPath);
        expect(stats.isDirectory()).to.equal(true);
        expect(stats.isSymbolicLink()).to.equal(false);
        expect(stats.mtime.getTime()).to.equal(fs.statSync(targetPath).mtime.getTime());
        const lstats = fs.lstatSync(linkPath);
        expect(lstats.isDirectory()).to.equal(false);
        expect(lstats.isSymbolicLink()).to.equal(true);
      });

      it("creates a link to a non existing path", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);

        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        fs.symlinkSync(targetPath, linkPath);

        expect(fs.lstatSync(linkPath).isSymbolicLink()).to.eq(true);
        expect(() => fs.readFileSync(linkPath, "utf8")).to.throw("ENOENT");

        fs.writeFileSync(targetPath, SAMPLE_CONTENT);
        expect(fs.statSync(linkPath).isFile()).to.eq(true);
        expect(fs.readFileSync(linkPath, "utf8")).to.eq(SAMPLE_CONTENT);
      });

      it("picks up a target created after the link", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);

        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        fs.symlinkSync(targetPath, linkPath);
        fs.writeFileSync(targetPath, SAMPLE_CONTENT);

        expect(fs.statSync(linkPath).isFile()).to.eq(true);
        expect(fs.readFileSync(linkPath, "utf8")).to.eq(SAMPLE_CONTENT);
      });

      it("provides link stats even if target is deleted", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        fs.writeFileSync(targetPath, SAMPLE_CONTENT);
        fs.symlinkSync(targetPath, linkPath);

        fs.unlinkSync(targetPath);

        expect(fs.lstatSync(linkPath).isSymbolicLink()).to.eq(true);
        expect(fs.statSync(linkPath, { throwIfNoEntry: false })).to.equal(undefined);
      });

      it("resolves the real path of a link", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        fs.writeFileSync(targetPath, SAMPLE_CONTENT);
        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        const linkToLinkPath = fs.join(tempDirectoryPath, `${LINK_NAME}2`);

        fs.symlinkSync(targetPath, linkPath);
        fs.symlinkSync(linkPath, linkToLinkPath);

        expect(fs.realpathSync(linkPath)).to.equal(targetPath);
        expect(fs.realpathSync(linkToLinkPath)).to.equal(targetPath);
      });

      it("resolves the real path of a file inside a linked directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetDirectoryPath = fs.join(tempDirectoryPath, "target-dir");
        fs.mkdirSync(targetDirectoryPath);
        const targetFilePath = fs.join(targetDirectoryPath, TARGET_NAME);
        fs.writeFileSync(targetFilePath, SAMPLE_CONTENT);
        const linkedDirectoryPath = fs.join(tempDirectoryPath, LINK_NAME);

        fs.symlinkSync(targetDirectoryPath, linkedDirectoryPath, "junction");

        expect(fs.realpathSync(linkedDirectoryPath)).to.equal(targetDirectoryPath);
        expect(fs.realpathSync(fs.join(linkedDirectoryPath, TARGET_NAME))).to.equal(targetFilePath);

        const anotherDirectoryPath = fs.join(tempDirectoryPath, "another-dir");
        fs.mkdirSync(anotherDirectoryPath);
        const linkToLinkPath = fs.join(anotherDirectoryPath, `${LINK_NAME}2`);

        fs.symlinkSync(`../${LINK_NAME}`, linkToLinkPath, "junction");
        expect(fs.realpathSync(fs.join(linkToLinkPath, TARGET_NAME))).to.equal(targetFilePath);
      });

      it("keeps relative links relative", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        fs.writeFileSync(targetPath, SAMPLE_CONTENT);
        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);
        const innerDirectoryPath = fs.join(tempDirectoryPath, "inner");
        fs.mkdirSync(innerDirectoryPath);

        fs.symlinkSync(TARGET_NAME, linkPath);
        expect(fs.readlinkSync(linkPath)).to.equal(TARGET_NAME);

        const linkInInnerDirectoryPath = fs.join(innerDirectoryPath, LINK_NAME);
        fs.renameSync(linkPath, linkInInnerDirectoryPath);
        fs.renameSync(targetPath, fs.join(innerDirectoryPath, TARGET_NAME));
        expect(fs.readFileSync(linkInInnerDirectoryPath, "utf8")).to.equal(SAMPLE_CONTENT);
      });

      it("fails when link parent directory is missing", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetFilePath = fs.join(tempDirectoryPath, TARGET_NAME);
        fs.writeFileSync(targetFilePath, SAMPLE_CONTENT);
        const linkPath = fs.join(tempDirectoryPath, "non-existing", LINK_NAME);

        expect(() => fs.symlinkSync(targetFilePath, linkPath, "file")).to.throw("ENOENT");
      });

      it("fails creating a link over an existing file", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        fs.writeFileSync(targetPath, SAMPLE_CONTENT);
        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);

        fs.writeFileSync(linkPath, SAMPLE_CONTENT);

        expect(() => fs.symlinkSync(targetPath, linkPath)).to.throw("EEXIST");
      });

      it("fails creating a link over an existing directory", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;
        const targetPath = fs.join(tempDirectoryPath, TARGET_NAME);
        const linkPath = fs.join(tempDirectoryPath, LINK_NAME);

        fs.mkdirSync(targetPath);
        fs.mkdirSync(linkPath);

        expect(() => fs.symlinkSync(targetPath, linkPath, "junction")).to.throw("EEXIST");
      });
    });

    describe("removing directories and files", () => {
      it("removes an existing file, no matter the flags", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");
        const secondFilePath = fs.join(tempDirectoryPath, "file2");
        const thirdFilePath = fs.join(tempDirectoryPath, "file3");
        const fourthFilePath = fs.join(tempDirectoryPath, "file4");
        fs.writeFileSync(filePath, SAMPLE_CONTENT);
        fs.writeFileSync(secondFilePath, SAMPLE_CONTENT);
        fs.writeFileSync(thirdFilePath, SAMPLE_CONTENT);
        fs.writeFileSync(fourthFilePath, SAMPLE_CONTENT);

        fs.rmSync(filePath);
        fs.rmSync(secondFilePath, { recursive: true });
        fs.rmSync(thirdFilePath, { force: true });
        fs.rmSync(fourthFilePath, { force: true, recursive: true });

        expect(fs.statSync(filePath, { throwIfNoEntry: false })).to.equal(undefined);
        expect(fs.statSync(secondFilePath, { throwIfNoEntry: false })).to.equal(undefined);
        expect(fs.statSync(thirdFilePath, { throwIfNoEntry: false })).to.equal(undefined);
        expect(fs.statSync(fourthFilePath, { throwIfNoEntry: false })).to.equal(undefined);
      });

      it('removes an empty or populated directory when "recursive" is set', () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const emptyDirectoryPath = fs.join(tempDirectoryPath, "dir");
        const populatedDirectoryPath = fs.join(tempDirectoryPath, "dir-with-file");
        fs.mkdirSync(emptyDirectoryPath);
        fs.mkdirSync(populatedDirectoryPath);
        fs.writeFileSync(fs.join(populatedDirectoryPath, "file"), SAMPLE_CONTENT);

        fs.rmSync(emptyDirectoryPath, { recursive: true });
        fs.rmSync(populatedDirectoryPath, { recursive: true });

        expect(fs.statSync(emptyDirectoryPath, { throwIfNoEntry: false })).to.equal(undefined);
        expect(fs.statSync(populatedDirectoryPath, { throwIfNoEntry: false })).to.equal(undefined);
      });

      it('fails removing a directory when "recursive" is not set', () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const emptyDirectoryPath = fs.join(tempDirectoryPath, "dir");
        const populatedDirectoryPath = fs.join(tempDirectoryPath, "dir-with-file");
        fs.mkdirSync(emptyDirectoryPath);
        fs.mkdirSync(populatedDirectoryPath);
        fs.writeFileSync(fs.join(populatedDirectoryPath, "file"), SAMPLE_CONTENT);

        // linux throws `EISDIR`, Windows throws `EPERM`
        expect(() => fs.rmSync(emptyDirectoryPath)).to.throw();
        expect(() => fs.rmSync(emptyDirectoryPath, { force: true })).to.throw();
        expect(() => fs.rmSync(populatedDirectoryPath)).to.throw();
        expect(() => fs.rmSync(populatedDirectoryPath, { force: true })).to.throw();
      });

      it("throws removing a non-existing target", () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetPath = fs.join(tempDirectoryPath, "target");

        expect(() => fs.rmSync(targetPath)).to.throw("ENOENT");
        expect(() => fs.rmSync(targetPath, { recursive: true })).to.throw("ENOENT");
      });

      it('does not fail removing a non-existing target if "force" is set', () => {
        using testInput = testProvider();
        const { fs, tempDirectoryPath } = testInput;

        const targetPath = fs.join(tempDirectoryPath, "target");

        expect(() => fs.rmSync(targetPath, { force: true })).to.not.throw();
        expect(() => fs.rmSync(targetPath, { force: true, recursive: true })).to.not.throw();
      });
    });
  });
}
