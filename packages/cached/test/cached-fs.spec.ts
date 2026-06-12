import { createCachedFs } from "@file-services/cached";
import { createMemoryFs } from "@file-services/memory";
import { asyncBaseFsContract, syncBaseFsContract } from "@file-services/test-kit";
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

chai.use(chaiAsPromised);

describe("createCachedFs", () => {
  const SAMPLE_CONTENT = "content";

  describe("cached api", () => {
    it("caches fs.statSync existing files", async () => {
      const memFs = createMemoryFs({ file: SAMPLE_CONTENT });
      const statSpy = sinon.spy(memFs, "statSync");
      const fs = createCachedFs(memFs);

      const stats = fs.statSync("/file");
      const stats2 = fs.statSync("/file");
      const stats3 = fs.statSync("./file");
      const stats4 = fs.statSync("file");

      expect(statSpy.callCount).to.equal(1);
      expect(stats).to.equal(stats2);
      expect(stats).to.equal(stats3);
      expect(stats).to.equal(stats4);
    });

    it("caches fs.statSync for missing files", async () => {
      const memFs = createMemoryFs();
      const statSpy = sinon.spy(memFs, "statSync");
      const fs = createCachedFs(memFs);

      expect(() => fs.statSync("/missing")).to.throw();
      expect(() => fs.statSync("/missing")).to.throw();
      expect(() => fs.statSync("./missing")).to.throw();
      expect(() => fs.statSync("missing")).to.throw();

      expect(statSpy.callCount).to.equal(1);
    });

    it("caches fs.promises.stat for existing files", async () => {
      const memFs = createMemoryFs({ file: SAMPLE_CONTENT });
      const statSpy = sinon.spy(memFs.promises, "stat");
      const fs = createCachedFs(memFs);

      const stats = await fs.promises.stat("/file");
      const stats2 = await fs.promises.stat("/file");
      const stats3 = await fs.promises.stat("./file");
      const stats4 = await fs.promises.stat("file");

      expect(statSpy.callCount).to.equal(1);
      expect(stats).to.equal(stats2);
      expect(stats).to.equal(stats3);
      expect(stats).to.equal(stats4);
    });

    it("caches fs.promises.stat for missing files", async () => {
      const memFs = createMemoryFs();
      const statSpy = sinon.spy(memFs.promises, "stat");
      const fs = createCachedFs(memFs);

      await expect(fs.promises.stat("/missing")).to.eventually.be.rejectedWith();
      await expect(fs.promises.stat("/missing")).to.eventually.be.rejectedWith();
      await expect(fs.promises.stat("./missing")).to.eventually.be.rejectedWith();
      await expect(fs.promises.stat("missing")).to.eventually.be.rejectedWith();

      expect(statSpy.callCount).to.equal(1);
    });

    it("caches fs.realpathSync for existing files", async () => {
      const memFs = createMemoryFs({ file: SAMPLE_CONTENT });
      const realpathSpy = sinon.spy(memFs, "realpathSync");
      const fs = createCachedFs(memFs);

      const actualPath = fs.realpathSync("/file");
      const actualPath2 = fs.realpathSync("/file");
      const actualPath3 = fs.realpathSync("./file");
      const actualPath4 = fs.realpathSync("file");

      expect(realpathSpy.callCount).to.equal(1);
      expect(actualPath).to.equal(actualPath2);
      expect(actualPath).to.equal(actualPath3);
      expect(actualPath).to.equal(actualPath4);
    });

    it("caches fs.promises.realpath for existing files", async () => {
      const memFs = createMemoryFs({ file: SAMPLE_CONTENT });
      const realpathSpy = sinon.spy(memFs.promises, "realpath");
      const fs = createCachedFs(memFs);

      const actualPath = await fs.promises.realpath("/file");
      const actualPath2 = await fs.promises.realpath("/file");
      const actualPath3 = await fs.promises.realpath("./file");
      const actualPath4 = await fs.promises.realpath("file");

      expect(realpathSpy.callCount).to.equal(1);
      expect(actualPath).to.equal(actualPath2);
      expect(actualPath).to.equal(actualPath3);
      expect(actualPath).to.equal(actualPath4);
    });

    it("rebinds extended api to the cached base functions", () => {
      const memFs = createMemoryFs({ file: SAMPLE_CONTENT });
      const statSpy = sinon.spy(memFs, "statSync");
      const fs = createCachedFs(memFs);

      expect(fs.fileExistsSync("/file")).to.equal(true);
      expect(fs.fileExistsSync("/file")).to.equal(true);
      expect(fs.fileExistsSync("./file")).to.equal(true);
      expect(fs.fileExistsSync("file")).to.equal(true);
      expect(statSpy.callCount).to.equal(1);
    });
  });

  describe("cache invalidation", () => {
    it("allows invalidating cache for existing files", async () => {
      const filePath = "/file";
      const memFs = createMemoryFs({ [filePath]: SAMPLE_CONTENT });
      const statSyncSpy = sinon.spy(memFs, "statSync");
      const promiseStatSpy = sinon.spy(memFs.promises, "stat");
      const fs = createCachedFs(memFs);

      fs.statSync(filePath);
      await fs.promises.stat(filePath);

      fs.invalidate(filePath);

      fs.statSync(filePath);
      await fs.promises.stat(filePath);

      expect(statSyncSpy.callCount).to.equal(2);
      expect(promiseStatSpy.callCount).to.equal(0);
    });

    it("allows invalidating cache for missing files", async () => {
      const filePath = "/missing";
      const memFs = createMemoryFs();
      const statSyncSpy = sinon.spy(memFs, "statSync");
      const promiseStatSpy = sinon.spy(memFs.promises, "stat");
      const fs = createCachedFs(memFs);

      expect(() => fs.statSync(filePath)).to.throw();
      await expect(fs.promises.stat(filePath)).to.eventually.be.rejectedWith();

      fs.invalidate(filePath);

      expect(() => fs.statSync(filePath)).to.throw();
      await expect(fs.promises.stat(filePath)).to.eventually.be.rejectedWith();

      expect(statSyncSpy.callCount).to.equal(2);
      expect(promiseStatSpy.callCount).to.equal(0);
    });

    it("allows invalidating cache for all file paths", async () => {
      const filePath = "/file";
      const memFs = createMemoryFs({ [filePath]: SAMPLE_CONTENT });
      const statSpy = sinon.spy(memFs, "statSync");
      const promiseStatSpy = sinon.spy(memFs.promises, "stat");
      const fs = createCachedFs(memFs);

      const stats = fs.statSync(filePath);
      fs.invalidateAll();
      const stats2 = fs.promises.stat(filePath);

      expect(statSpy.callCount).to.equal(1);
      expect(promiseStatSpy.callCount).to.equal(1);
      expect(stats).to.not.equal(stats2);
    });

    it("deep invalidation should invalidate all the keys starting with the invalidation path", async () => {
      const dirPath = "/dir";
      const fileName = "file";
      const filePath = `${dirPath}/${fileName}`;
      const memFs = createMemoryFs({ [filePath]: SAMPLE_CONTENT });
      const statSyncSpy = sinon.spy(memFs, "statSync");
      const promiseStatSpy = sinon.spy(memFs.promises, "stat");
      const fs = createCachedFs(memFs);

      fs.statSync(filePath);
      await fs.promises.stat(filePath);

      fs.invalidate(dirPath, true);

      fs.statSync(filePath);
      await fs.promises.stat(filePath);

      expect(statSyncSpy.callCount).to.equal(2);
      expect(promiseStatSpy.callCount).to.equal(0);
    });
  });

  it("deep invalidation shouldnt invalidate ajdacent directories", async () => {
    const memFs = createMemoryFs({
      dir: { file: SAMPLE_CONTENT },
      dir2: { file: SAMPLE_CONTENT },
    });
    const filePath = memFs.join("dir2", "file");

    const statSyncSpy = sinon.spy(memFs, "statSync");
    const fs = createCachedFs(memFs);

    fs.statSync(filePath);

    // Not the dir I'm stating!
    fs.invalidate("dir", true);

    fs.statSync(filePath);

    expect(statSyncSpy.callCount).to.equal(1);
  });

  it("should invalidate the entire fs when passing slash", async () => {
    const memFs = createMemoryFs({
      dir: { file: SAMPLE_CONTENT },
      dir2: { file: SAMPLE_CONTENT },
    });
    const filePath = memFs.join("dir2", "file");

    const statSyncSpy = sinon.spy(memFs, "statSync");
    const fs = createCachedFs(memFs);

    fs.statSync(filePath);

    fs.invalidate("/", true);

    fs.statSync(filePath);

    expect(statSyncSpy.callCount).to.equal(2);
  });

  const testProvider = () => {
    const fs = createCachedFs(createMemoryFs());
    return {
      fs,
      tempDirectoryPath: fs.cwd(),
      [Symbol.dispose]() {},
    };
  };

  asyncBaseFsContract(testProvider);
  syncBaseFsContract(testProvider);
});
