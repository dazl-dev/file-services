import { createNodeFs } from "@file-services/node";
import { asyncBaseFsContract, asyncFsContract, syncBaseFsContract, syncFsContract } from "@file-services/test-kit";
import { expect } from "chai";
import { createTempDirectorySync } from "create-temp-directory";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";

describe("Node File System Implementation", function () {
  this.timeout(10_000);

  const fs = createNodeFs();

  const testProvider = () => {
    const tempDirectory = createTempDirectorySync("fs-test-");

    return {
      fs,
      tempDirectoryPath: tempDirectory.path,
      [Symbol.dispose]: tempDirectory.remove,
    };
  };

  // disable sync contract on mac
  // async contract passes, which is really what we care about.
  // avoid introducing more and more workarounds to support mac watcher being ready synchronously.
  if (platform() !== "darwin") {
    const supportsRecursiveWatch = parseInt(process.versions.node, 10) >= 20 || platform() !== "linux";
    syncBaseFsContract(testProvider, supportsRecursiveWatch);
  }
  asyncBaseFsContract(testProvider);

  asyncFsContract(testProvider);
  syncFsContract(testProvider);

  it("returns instances of Buffer when reading binary", async () => {
    const fs = createNodeFs();
    expect(fs.readFileSync(fileURLToPath(import.meta.url))).to.be.instanceOf(Buffer);
    expect(await fs.promises.readFile(fileURLToPath(import.meta.url))).to.be.instanceOf(Buffer);
  });
});
