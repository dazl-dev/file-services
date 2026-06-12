import { expect } from "chai";
import { asyncBaseFsContract, asyncFsContract, syncBaseFsContract, syncFsContract } from "@file-services/test-kit";
import { createMemoryFs } from "@file-services/memory";
import { createOverlayFs } from "@file-services/overlay";

const sampleContent1 = `111`;
const sampleContent2 = `222`;
const sampleContent3 = `333`;

describe("overlay fs", () => {
  const testProvider = () => {
    return {
      fs: createOverlayFs(createMemoryFs(), createMemoryFs()),
      tempDirectoryPath: "/",
      [Symbol.dispose]() {},
    };
  };

  syncBaseFsContract(testProvider);
  asyncBaseFsContract(testProvider);
  syncFsContract(testProvider);
  asyncFsContract(testProvider);

  it("overlays higher fs files and folders over lower fs", async () => {
    const srcFile1Path = "/src/file1.js";
    const srcFile2Path = "/src/file2.js";
    const rootFilePath = "/file.js";
    const folderPath = "/empty-folder";

    const lower = createMemoryFs({
      [srcFile1Path]: sampleContent1,
      [srcFile2Path]: sampleContent2,
    });
    const upper = createMemoryFs({
      [rootFilePath]: sampleContent3,
      [srcFile2Path]: sampleContent3,
      [folderPath]: {},
    });

    const {
      readFileSync,
      fileExistsSync,
      directoryExistsSync,
      existsSync,
      promises: { readFile, fileExists, directoryExists, exists },
    } = createOverlayFs(lower, upper);

    expect(readFileSync(srcFile1Path, "utf8")).to.equal(sampleContent1);
    expect(readFileSync(srcFile2Path, "utf8")).to.equal(sampleContent3);
    expect(readFileSync(rootFilePath, "utf8")).to.equal(sampleContent3);

    expect(await readFile(srcFile1Path, "utf8")).to.equal(sampleContent1);
    expect(await readFile(srcFile2Path, "utf8")).to.equal(sampleContent3);
    expect(await readFile(rootFilePath, "utf8")).to.equal(sampleContent3);

    expect(fileExistsSync(srcFile1Path)).to.equal(true);
    expect(fileExistsSync(srcFile2Path)).to.equal(true);
    expect(fileExistsSync(rootFilePath)).to.equal(true);
    expect(directoryExistsSync(folderPath)).to.equal(true);
    expect(existsSync(folderPath)).to.equal(true);

    expect(await fileExists(srcFile1Path)).to.equal(true);
    expect(await fileExists(srcFile2Path)).to.equal(true);
    expect(await fileExists(rootFilePath)).to.equal(true);
    expect(await directoryExists(folderPath)).to.equal(true);
    expect(await exists(folderPath)).to.equal(true);
  });

  it("combines child nodes from both higher and lower file systems", async () => {
    const commonFolder = "/src";
    const fileInLower = "/src/file1.js";
    const fileInHigher = "/src/file2.js";
    const folderInLower = "/src/folder-1";
    const folderInHigher = "/src/folder-2";

    const lower = createMemoryFs({
      [fileInLower]: sampleContent1,
      [folderInLower]: {},
    });

    const higher = createMemoryFs({
      [fileInHigher]: sampleContent1,
      [folderInHigher]: {},
    });

    const {
      readdirSync,
      promises: { readdir },
    } = createOverlayFs(lower, higher);

    expect(readdirSync(commonFolder)).to.eql(["file1.js", "folder-1", "file2.js", "folder-2"]);
    expect(await readdir(commonFolder)).to.eql(["file1.js", "folder-1", "file2.js", "folder-2"]);
  });

  it("returns a single instance when both lower and higher contain an item", async () => {
    const srcPath = "/src";
    const fileInSrc = "/src/file.js";

    const lower = createMemoryFs({
      [fileInSrc]: sampleContent1,
    });

    const higher = createMemoryFs({
      [fileInSrc]: sampleContent1,
    });

    const {
      readdirSync,
      promises: { readdir },
    } = createOverlayFs(lower, higher);

    expect(readdirSync(srcPath)).to.eql(["file.js"]);
    expect(await readdir(srcPath)).to.eql(["file.js"]);

    expect(readdirSync(srcPath, { withFileTypes: true })).to.have.lengthOf(1);
    expect(await readdir(srcPath, { withFileTypes: true })).to.have.lengthOf(1);
  });

  it(`resolves real path when given the parent dir of the base dir`, async function () {
    const upper = createMemoryFs({
      "/src/a": {},
    });
    const lower = createMemoryFs({
      "/src": {},
    });

    const {
      realpathSync,
      promises: { realpath },
    } = createOverlayFs(lower, upper, "/src/a");

    expect(realpathSync("/src")).to.eql("/src");
    expect(await realpath("/src")).to.eql("/src");
  });
});
