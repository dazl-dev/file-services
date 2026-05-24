import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { IBaseFileSystemAsync, FileSystemConstants } from "@file-services/types";
import type { ITestInput } from "./types.js";

chai.use(chaiAsPromised);

const SAMPLE_CONTENT = "content";
const DIFFERENT_CONTENT = "another content";

export function asyncBaseFsContract(testProvider: () => Promise<ITestInput<IBaseFileSystemAsync>>): void {
  describe("ASYNC file system contract", () => {
    let testInput: ITestInput<IBaseFileSystemAsync>;

    beforeEach(async () => (testInput = await testProvider()));
    afterEach(async () => await testInput.dispose());

    describe("writing files", () => {
      it("can write a new file into an existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { stat, readFile, writeFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);

        expect((await stat(filePath)).isFile()).to.equal(true);
        expect(await readFile(filePath, "utf8")).to.eql(SAMPLE_CONTENT);
      });

      it("can write a binary file", async () => {
        const {
          fs: {
            join,
            promises: { writeFile, readFile, stat },
          },
          tempDirectoryPath,
        } = testInput;

        const filePath = join(tempDirectoryPath, "file");
        const BINARY_CONTENT = new Uint8Array([1, 2, 3, 4, 5]);
        await writeFile(filePath, BINARY_CONTENT);

        expect((await stat(filePath)).isFile()).to.equal(true);
        const readBackContents = await readFile(filePath);
        expect(readBackContents).to.be.instanceOf(Uint8Array);
        expect(readBackContents).to.eql(BINARY_CONTENT);
        readBackContents[0] = 5;
        BINARY_CONTENT[0] = 5;
        expect(await readFile(filePath)).to.eql(new Uint8Array([1, 2, 3, 4, 5]));
      });

      it("can overwrite an existing file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { stat, readFile, writeFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);
        await writeFile(filePath, DIFFERENT_CONTENT);

        expect((await stat(filePath)).isFile()).to.equal(true);
        expect(await readFile(filePath, "utf8")).to.eql(DIFFERENT_CONTENT);
      });

      it("fails if writing a file to a non-existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { writeFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "missing-dir", "file");

        await expect(writeFile(filePath, SAMPLE_CONTENT)).to.be.rejectedWith("ENOENT");
      });

      it("fails if writing a file to a path already pointing to a directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { writeFile, mkdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "dir");

        await mkdir(directoryPath);

        await expect(writeFile(directoryPath, SAMPLE_CONTENT)).to.be.rejectedWith("EISDIR");
      });

      it("fails if writing to a file without a name", async () => {
        const {
          fs: {
            promises: { writeFile },
          },
        } = testInput;

        await expect(writeFile("", SAMPLE_CONTENT)).to.be.rejectedWith("ENOENT");
      });
    });

    it("stat size reflects the byte size of written content", async () => {
      const {
        tempDirectoryPath,
        fs: {
          join,
          promises: { stat, writeFile },
        },
      } = testInput;
      const filePath = join(tempDirectoryPath, "file");
      const SAMPLE_CONTENT = "🚀";
      const DIFFERENT_CONTENT = "🚀🚀";
      const binaryContent = new Uint8Array([1, 2, 3, 4, 5]);
      const encoder = new TextEncoder();

      await writeFile(filePath, SAMPLE_CONTENT);
      expect((await stat(filePath)).size, "string content").to.equal(encoder.encode(SAMPLE_CONTENT).byteLength);

      await writeFile(filePath, DIFFERENT_CONTENT);
      expect((await stat(filePath)).size, "overwritten content").to.equal(encoder.encode(DIFFERENT_CONTENT).byteLength);

      await writeFile(filePath, binaryContent);
      expect((await stat(filePath)).size, "binary content").to.equal(binaryContent.byteLength);

      // directory size is implementation-defined
      expect((await stat(tempDirectoryPath)).size, "directory").to.be.a("number");
    });

    describe("reading files", () => {
      it("can read the contents of a file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { readFile, writeFile },
          },
        } = testInput;
        const firstFilePath = join(tempDirectoryPath, "first-file");
        const secondFilePath = join(tempDirectoryPath, "second-file");

        await writeFile(firstFilePath, SAMPLE_CONTENT);
        await writeFile(secondFilePath, DIFFERENT_CONTENT);

        expect(await readFile(firstFilePath, "utf8"), "contents of first-file").to.eql(SAMPLE_CONTENT);
        expect(await readFile(secondFilePath, "utf8"), "contents of second-file").to.eql(DIFFERENT_CONTENT);
      });

      it("fails if reading a non-existing file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { readFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "missing-file");

        await expect(readFile(filePath, "utf8")).to.be.rejectedWith("ENOENT");
      });

      it("fails if reading a directory as a file", async () => {
        const {
          fs: {
            promises: { readFile },
          },
          tempDirectoryPath,
        } = testInput;

        await expect(readFile(tempDirectoryPath, "utf8")).to.be.rejectedWith("EISDIR");
      });
    });

    describe("removing files", () => {
      it("can remove files", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { stat, unlink, writeFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);
        await unlink(filePath);

        await expect(stat(filePath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if trying to remove a non-existing file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { unlink },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "missing-file");

        await expect(unlink(filePath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if trying to remove a directory as a file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, unlink },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "dir");

        await mkdir(directoryPath);

        await expect(unlink(directoryPath)).to.be.rejectedWith(); // linux throws `EISDIR`, mac throws `EPERM`
      });
    });

    describe("creating directories", () => {
      it("can create an empty directory inside an existing one", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, stat, readdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "new-dir");

        await mkdir(directoryPath);

        expect((await stat(directoryPath)).isDirectory()).to.equal(true);
        expect(await readdir(directoryPath)).to.eql([]);
      });

      it("fails if creating in a path pointing to an existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "dir");

        await mkdir(directoryPath);

        await expect(mkdir(directoryPath)).to.be.rejectedWith("EEXIST");
      });

      it("fails if creating in a path pointing to an existing file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, writeFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);

        await expect(mkdir(filePath)).to.be.rejectedWith("EEXIST");
      });

      it("fails if creating a directory inside a non-existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "outer", "inner");

        await expect(mkdir(directoryPath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if creating a directory inside of a file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, writeFile },
          },
        } = testInput;

        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);

        await expect(mkdir(join(filePath, "dir"))).to.be.rejectedWith(/ENOTDIR|ENOENT/); // posix / windows
      });

      describe("recursively", () => {
        it("can create an empty directory inside an existing one", async () => {
          const { fs, tempDirectoryPath } = testInput;
          const directoryPath = fs.join(tempDirectoryPath, "new-dir");

          await fs.promises.mkdir(directoryPath, { recursive: true });

          expect((await fs.promises.stat(directoryPath)).isDirectory()).to.equal(true);
          expect(await fs.promises.readdir(directoryPath)).to.eql([]);
        });

        it("creates parent directory chain when possible", async () => {
          const { fs, tempDirectoryPath } = testInput;
          const directoryPath = fs.join(tempDirectoryPath, "missing", "also-missing", "new-dir");

          await fs.promises.mkdir(directoryPath, { recursive: true });

          expect((await fs.promises.stat(directoryPath)).isDirectory()).to.equal(true);
          expect(await fs.promises.readdir(directoryPath)).to.eql([]);
        });

        it("succeeds if creating in a path pointing to an existing directory", async () => {
          const { fs, tempDirectoryPath } = testInput;
          const directoryPath = fs.join(tempDirectoryPath, "dir");
          await fs.promises.mkdir(directoryPath);

          await expect(fs.promises.mkdir(directoryPath, { recursive: true })).to.eventually.become(undefined);
        });

        it("fails if creating in a path pointing to an existing file", async () => {
          const { fs, tempDirectoryPath } = testInput;
          const filePath = fs.join(tempDirectoryPath, "file");
          await fs.promises.writeFile(filePath, SAMPLE_CONTENT);

          await expect(fs.promises.mkdir(filePath, { recursive: true })).to.eventually.be.rejectedWith("EEXIST");
        });

        it("fails if creating a directory inside of a file", async () => {
          const { fs, tempDirectoryPath } = testInput;
          const filePath = fs.join(tempDirectoryPath, "file");
          await fs.promises.writeFile(filePath, SAMPLE_CONTENT);

          await expect(fs.promises.mkdir(fs.join(filePath, "dir"), { recursive: true })).to.eventually.be.rejectedWith(
            "ENOTDIR",
          );
        });
      });
    });

    describe("listing directories", () => {
      it("can list an existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, writeFile, readdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "dir");

        await mkdir(directoryPath);
        await writeFile(join(directoryPath, "file1"), SAMPLE_CONTENT);
        await writeFile(join(directoryPath, "camelCasedName"), SAMPLE_CONTENT);

        expect(await readdir(tempDirectoryPath)).to.eql(["dir"]);
        const directoryContents = await readdir(directoryPath);
        expect(directoryContents).to.have.lengthOf(2);
        expect(directoryContents).to.contain("file1");
        expect(directoryContents).to.contain("camelCasedName");
      });

      it("lists directory entries", async () => {
        const { fs, tempDirectoryPath } = testInput;

        await fs.promises.mkdir(fs.join(tempDirectoryPath, "dir"));
        await fs.promises.writeFile(fs.join(tempDirectoryPath, "file"), SAMPLE_CONTENT);

        const directoryContents = await fs.promises.readdir(tempDirectoryPath, { withFileTypes: true });

        expect(directoryContents).to.have.lengthOf(2);
        const [firstItem, secondItem] = directoryContents;

        expect(firstItem?.name).to.equal("dir");
        expect(firstItem?.isDirectory()).to.equal(true);
        expect(firstItem?.isFile()).to.equal(false);

        expect(secondItem?.name).to.equal("file");
        expect(secondItem?.isDirectory()).to.equal(false);
        expect(secondItem?.isFile()).to.equal(true);
      });

      it("fails if listing a non-existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { readdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "missing-dir");

        await expect(readdir(directoryPath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if listing a path pointing to a file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { writeFile, readdir },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);

        await expect(readdir(filePath)).to.be.rejectedWith("ENOTDIR");
      });
    });

    describe("removing directories", () => {
      it("can remove an existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, rmdir, stat },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "dir");

        await mkdir(directoryPath);
        await rmdir(directoryPath);

        await expect(stat(directoryPath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if removing a non-empty directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { mkdir, writeFile, rmdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "dir");

        await mkdir(directoryPath);
        await writeFile(join(directoryPath, "file"), SAMPLE_CONTENT);

        await expect(rmdir(directoryPath)).to.be.rejectedWith("ENOTEMPTY");
      });

      it("fails if removing a non-existing directory", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { rmdir },
          },
        } = testInput;
        const directoryPath = join(tempDirectoryPath, "missing-dir");

        await expect(rmdir(directoryPath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if removing a path pointing to a file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { rmdir, writeFile },
          },
        } = testInput;
        const filePath = join(tempDirectoryPath, "file");

        await writeFile(filePath, SAMPLE_CONTENT);

        await expect(rmdir(filePath)).to.be.rejectedWith();
      });
    });

    describe("renaming directories and files", () => {
      it("moves a file", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { writeFile, stat, mkdir, rename, readFile },
          },
        } = testInput;
        const sourcePath = join(tempDirectoryPath, "file");
        const destinationPath = join(tempDirectoryPath, "dir", "subdir", "movedFile");

        await writeFile(sourcePath, SAMPLE_CONTENT);
        await mkdir(join(tempDirectoryPath, "dir"));
        await mkdir(join(tempDirectoryPath, "dir", "subdir"));

        const sourceStats = await stat(sourcePath);

        await rename(sourcePath, destinationPath);

        const destStats = await stat(destinationPath);
        expect(destStats.isFile()).to.equal(true);
        expect(destStats.mtime).not.to.equal(sourceStats.mtime);
        expect(await readFile(destinationPath, "utf8")).to.eql(SAMPLE_CONTENT);
        await expect(stat(sourcePath)).to.be.rejectedWith("ENOENT");
      });

      it(`throws if source path doesn't exist`, async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { rename },
          },
        } = testInput;
        const sourcePath = join(tempDirectoryPath, "file");
        const destPath = join(tempDirectoryPath, "file2");

        await expect(rename(sourcePath, destPath)).to.be.rejectedWith("ENOENT");
      });

      it(`throws if the containing directory of the source path doesn't exist`, async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { rename },
          },
        } = testInput;
        const sourcePath = join(tempDirectoryPath, "unicorn", "file");
        const destPath = join(tempDirectoryPath, "file2");

        await expect(rename(sourcePath, destPath)).to.be.rejectedWith("ENOENT");
      });

      it(`throws if destination containing path doesn't exist`, async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { rename, writeFile },
          },
        } = testInput;
        const sourcePath = join(tempDirectoryPath, "file");
        const destPath = join(tempDirectoryPath, "dir", "file2");

        await writeFile(sourcePath, SAMPLE_CONTENT);

        await expect(rename(sourcePath, destPath)).to.be.rejectedWith("ENOENT");
      });

      it("updates the parent directory of a renamed entry", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { rename, mkdir, readdir, writeFile },
          },
        } = testInput;
        const sourcePath = join(tempDirectoryPath, "sourceDir");
        const destPath = join(tempDirectoryPath, "destDir");

        await mkdir(sourcePath);
        await writeFile(join(sourcePath, "file"), SAMPLE_CONTENT);

        await rename(sourcePath, destPath);

        expect(await readdir(tempDirectoryPath)).to.include("destDir");
      });

      describe("renaming directories", () => {
        it("allows renaming a complex directory structure to another destination", async () => {
          const {
            tempDirectoryPath,
            fs: {
              join,
              promises: { rename, mkdir, writeFile, stat, readFile },
            },
          } = testInput;
          const sourcePath = join(tempDirectoryPath, "dir");
          const destinationPath = join(tempDirectoryPath, "anotherDir", "subdir", "movedDir");
          await mkdir(join(tempDirectoryPath, "dir"));
          await mkdir(join(tempDirectoryPath, "anotherDir"));
          await mkdir(join(tempDirectoryPath, "anotherDir", "subdir"));
          await writeFile(join(sourcePath, "file"), SAMPLE_CONTENT);

          await rename(sourcePath, destinationPath);

          expect((await stat(destinationPath)).isDirectory()).to.equal(true);
          expect(await readFile(join(destinationPath, "file"), "utf8")).to.eql(SAMPLE_CONTENT);
          await expect(stat(sourcePath)).to.be.rejectedWith("ENOENT");
        });

        it(`allows renaming a directory over a non-existing directory`, async () => {
          const {
            tempDirectoryPath,
            fs: {
              join,
              promises: { rename, mkdir, writeFile },
            },
          } = testInput;
          const sourcePath = join(tempDirectoryPath, "sourceDir");

          await mkdir(sourcePath);
          await writeFile(join(sourcePath, "file"), SAMPLE_CONTENT);

          await expect(rename(sourcePath, join(tempDirectoryPath, "destDir"))).to.not.be.rejectedWith("EEXIST");
        });

        it(`allows renaming a directory over an empty directory`, async () => {
          const {
            tempDirectoryPath,
            fs: {
              join,
              promises: { rename, mkdir, writeFile },
            },
          } = testInput;
          const sourcePath = join(tempDirectoryPath, "sourceDir");
          const destPath = join(tempDirectoryPath, "destDir");

          await mkdir(sourcePath);
          await mkdir(destPath);
          await writeFile(join(sourcePath, "file"), SAMPLE_CONTENT);

          await expect(rename(sourcePath, destPath)).to.not.be.rejectedWith("EEXIST");
        });
      });
    });

    it("correctly exposes whether it is case sensitive", async () => {
      const {
        tempDirectoryPath,
        fs: {
          join,
          caseSensitive,
          promises: { writeFile, stat },
        },
      } = testInput;
      const filePath = join(tempDirectoryPath, "file");
      const upperCaseFilePath = filePath.toUpperCase();

      await writeFile(filePath, SAMPLE_CONTENT);

      if (caseSensitive) {
        await expect(stat(upperCaseFilePath)).to.be.rejectedWith("ENOENT");
      } else {
        expect((await stat(upperCaseFilePath)).isFile()).to.equal(true);
      }
    });

    describe("copying files/directories", () => {
      const SOURCE_FILE_NAME = "file.txt";
      let targetDirectoryPath: string;
      let sourceFilePath: string;

      beforeEach(async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { writeFile, mkdir },
          },
        } = testInput;
        targetDirectoryPath = join(tempDirectoryPath, "dir");

        await mkdir(targetDirectoryPath);
        sourceFilePath = join(tempDirectoryPath, SOURCE_FILE_NAME);
        await writeFile(sourceFilePath, SAMPLE_CONTENT);
      });

      it("can copy file", async () => {
        const {
          fs: {
            join,
            promises: { copyFile, readFile },
          },
        } = testInput;
        const targetPath = join(targetDirectoryPath, SOURCE_FILE_NAME);

        await copyFile(sourceFilePath, targetPath);

        expect(await readFile(targetPath, "utf8")).to.be.eql(SAMPLE_CONTENT);
      });

      it("fails if source does not exist", async () => {
        const {
          tempDirectoryPath,
          fs: {
            join,
            promises: { copyFile },
          },
        } = testInput;
        const sourcePath = join(tempDirectoryPath, "nonExistingFileName.txt");
        const targetPath = join(targetDirectoryPath, SOURCE_FILE_NAME);

        await expect(copyFile(sourcePath, targetPath)).to.be.rejectedWith("ENOENT");
      });

      it("fails if target containing directory does not exist", async () => {
        const {
          fs: {
            join,
            promises: { copyFile },
          },
        } = testInput;
        const targetPath = join(targetDirectoryPath, "nonExistingDirectory", SOURCE_FILE_NAME);

        await expect(copyFile(sourceFilePath, targetPath)).to.be.rejectedWith("ENOENT");
      });

      it("overwrites destination file by default", async () => {
        const {
          fs: {
            join,
            promises: { copyFile, readFile, writeFile },
          },
        } = testInput;
        const targetPath = join(targetDirectoryPath, SOURCE_FILE_NAME);

        await writeFile(targetPath, "content to be overwritten");
        await copyFile(sourceFilePath, targetPath);

        expect(await readFile(targetPath, "utf8")).to.be.eql(SAMPLE_CONTENT);
      });

      it("fails if destination exists and flag COPYFILE_EXCL passed", async () => {
        const {
          fs: {
            join,
            promises: { copyFile, writeFile },
          },
        } = testInput;
        const targetPath = join(targetDirectoryPath, SOURCE_FILE_NAME);

        await writeFile(targetPath, "content to be overwritten");

        await expect(copyFile(sourceFilePath, targetPath, FileSystemConstants.COPYFILE_EXCL)).to.be.rejectedWith(
          "EEXIST",
        );
      });
    });

    describe("removing directories and files", () => {
      it("removes an existing file, no matter the flags", async () => {
        const { fs, tempDirectoryPath } = testInput;

        const filePath = fs.join(tempDirectoryPath, "file");
        const secondFilePath = fs.join(tempDirectoryPath, "file2");
        const thirdFilePath = fs.join(tempDirectoryPath, "file3");
        const fourthFilePath = fs.join(tempDirectoryPath, "file4");
        await fs.promises.writeFile(filePath, SAMPLE_CONTENT);
        await fs.promises.writeFile(secondFilePath, SAMPLE_CONTENT);
        await fs.promises.writeFile(thirdFilePath, SAMPLE_CONTENT);
        await fs.promises.writeFile(fourthFilePath, SAMPLE_CONTENT);

        await fs.promises.rm(filePath);
        await fs.promises.rm(secondFilePath, { recursive: true });
        await fs.promises.rm(thirdFilePath, { force: true });
        await fs.promises.rm(fourthFilePath, { force: true, recursive: true });

        expect(await fs.promises.exists(filePath)).to.equal(false);
        expect(await fs.promises.exists(secondFilePath)).to.equal(false);
        expect(await fs.promises.exists(thirdFilePath)).to.equal(false);
        expect(await fs.promises.exists(fourthFilePath)).to.equal(false);
      });

      it('removes an empty or populated directory when "recursive" is set', async () => {
        const { fs, tempDirectoryPath } = testInput;

        const emptyDirectoryPath = fs.join(tempDirectoryPath, "dir");
        const populatedDirectoryPath = fs.join(tempDirectoryPath, "dir-with-file");
        await fs.promises.mkdir(emptyDirectoryPath);
        await fs.promises.mkdir(populatedDirectoryPath);
        await fs.promises.writeFile(fs.join(populatedDirectoryPath, "file"), SAMPLE_CONTENT);

        await fs.promises.rm(emptyDirectoryPath, { recursive: true });
        await fs.promises.rm(populatedDirectoryPath, { recursive: true });

        expect(await fs.promises.exists(emptyDirectoryPath)).to.equal(false);
        expect(await fs.promises.exists(populatedDirectoryPath)).to.equal(false);
      });

      it('fails removing a directory when "recursive" is not set', async () => {
        const { fs, tempDirectoryPath } = testInput;

        const emptyDirectoryPath = fs.join(tempDirectoryPath, "dir");
        const populatedDirectoryPath = fs.join(tempDirectoryPath, "dir-with-file");
        await fs.promises.mkdir(emptyDirectoryPath);
        await fs.promises.mkdir(populatedDirectoryPath);
        await fs.promises.writeFile(fs.join(populatedDirectoryPath, "file"), SAMPLE_CONTENT);

        // linux throws `EISDIR`, Windows throws `EPERM`
        await expect(fs.promises.rm(emptyDirectoryPath)).to.eventually.be.rejected;
        await expect(fs.promises.rm(emptyDirectoryPath, { force: true })).to.eventually.be.rejected;
        await expect(fs.promises.rm(populatedDirectoryPath)).to.eventually.be.rejected;
        await expect(fs.promises.rm(populatedDirectoryPath, { force: true })).to.eventually.be.rejected;
      });

      it("throws removing a non-existing target", async () => {
        const { fs, tempDirectoryPath } = testInput;

        const targetPath = fs.join(tempDirectoryPath, "target");

        await expect(fs.promises.rm(targetPath)).to.eventually.be.rejectedWith("ENOENT");
        await expect(fs.promises.rm(targetPath, { recursive: true })).to.eventually.be.rejectedWith("ENOENT");
      });

      it('does not fail removing a non-existing target if "force" is set', async () => {
        const { fs, tempDirectoryPath } = testInput;

        const targetPath = fs.join(tempDirectoryPath, "target");

        await expect(fs.promises.rm(targetPath, { force: true })).to.eventually.become(undefined);
        await expect(fs.promises.rm(targetPath, { force: true, recursive: true })).to.eventually.become(undefined);
      });
    });
  });
}
