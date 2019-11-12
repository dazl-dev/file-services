import { syncBaseFsContract, asyncBaseFsContract, syncFsContract, asyncFsContract } from '@file-services/test-kit';
import { createMemoryFs } from '../src';
import { expect } from 'chai';
import { sleep } from 'promise-assist';

describe('In-memory File System Implementation', () => {
    const testProvider = async () => {
        return {
            fs: createMemoryFs(),
            dispose: async () => undefined,
            tempDirectoryPath: '/'
        };
    };

    syncBaseFsContract(testProvider);
    asyncBaseFsContract(testProvider);
    syncFsContract(testProvider);
    asyncFsContract(testProvider);

    describe('path.resolve', () => {
        it('resolves non-absolute paths relative to root /', () => {
            const fs = createMemoryFs();

            expect(fs.resolve('test')).to.equal('/test');
            expect(fs.resolve('some/deep/path')).to.equal('/some/deep/path');
        });
    });

    describe('creating directories', () => {
        it('fails creating the root', async () => {
            const fs = createMemoryFs();

            expect(fs.readdirSync('/')).to.eql([]);
            expect(() => fs.mkdirSync('/')).to.throw('EEXIST');
            expect(fs.readdirSync('/')).to.eql([]);
        });
    });

    // these behaviors cannot be tested consistently across OSs,
    // so we test them for the memory implementation separately
    describe('copying files/directories', () => {
        const sourceFilePath = '/file.txt';
        const emptyDirectoryPath = '/empty_dir';

        it('preserves birthtime and updates mtime', async () => {
            const fs = createMemoryFs({
                [sourceFilePath]: 'test content',
                [emptyDirectoryPath]: {}
            });
            const sourceFileStats = fs.statSync(sourceFilePath);
            const destFilePath = fs.join(emptyDirectoryPath, 'dest');

            await sleep(100); // postpone copying to ensure timestamps are different

            fs.copyFileSync(sourceFilePath, destFilePath);

            const destFileStats = fs.statSync(destFilePath);

            expect(sourceFileStats.birthtime).to.eql(destFileStats.birthtime);
            expect(sourceFileStats.mtime).to.not.be.eql(destFileStats.mtime);
        });

        it('fails if source is a directory', () => {
            const fs = createMemoryFs({
                [emptyDirectoryPath]: {}
            });

            expect(() => fs.copyFileSync(emptyDirectoryPath, '/some_other_folder')).to.throw('EISDIR');
        });

        it('fails if target is a directory', () => {
            const fs = createMemoryFs({
                [sourceFilePath]: 'test content',
                [emptyDirectoryPath]: {}
            });

            expect(() => fs.copyFileSync(sourceFilePath, emptyDirectoryPath)).to.throw('EISDIR');
        });
    });
});
