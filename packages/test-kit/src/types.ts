/**
 * Represents everything required to run a single contract test.
 */
export interface ITestInput<T> {
  /**
   * file system to be tested
   */
  fs: T;

  /**
   * Absolute path to an empty directory
   */
  tempDirectoryPath: string;

  /**
   * Post-test cleanup
   */
  [Symbol.dispose](): void;
}
