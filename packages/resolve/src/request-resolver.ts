import type { PackageJson } from "type-fest";
import type { IRequestResolverOptions, IResolutionOutput, ISanitizedPackageJson, RequestResolver } from "./types.js";

export const defaultPackageRoots = ["node_modules"] as const;
export const defaultExtensions = [".js", ".json"] as const;
export const defaultConditions = ["browser", "import", "require"] as const;
const isRelative = (request: string) =>
  request === "." || request === ".." || request.startsWith("./") || request.startsWith("../");
const PACKAGE_JSON = "package.json";
const statsNoThrowOptions = { throwIfNoEntry: false } as const;

export function createRequestResolver(options: IRequestResolverOptions): RequestResolver {
  const {
    fs: { statSync, readFileSync, realpathSync, dirname, join, resolve, isAbsolute },
    packageRoots = defaultPackageRoots,
    extensions = defaultExtensions,
    conditions = defaultConditions,
    alias = {},
    fallback = {},
  } = options;

  const nativeRealPathSync = realpathSync.native ?? realpathSync;
  const exportConditions = new Set(conditions);
  const targetsBrowser = exportConditions.has("browser");
  const targetsEsm = exportConditions.has("import");
  const packageCache = new Map<string, ISanitizedPackageJson | undefined>();
  const loadPackageJsonFromCached = wrapWithCache(loadPackageJsonFrom, packageCache);
  const remapUsingAlias = createRequestRemapper(alias);
  const remapUsingFallback = createRequestRemapper(fallback);

  return requestResolver;

  function requestResolver(contextPath: string, originalRequest: string): IResolutionOutput {
    try {
      const visitedPaths = new Set<string>();
      for (const request of requestsToTry(contextPath, originalRequest, visitedPaths)) {
        if (request === false) {
          return { resolvedFile: request, visitedPaths };
        }

        for (const resolvedFilePath of nodeRequestPaths(contextPath, request, visitedPaths)) {
          visitedPaths.add(resolvedFilePath);
          if (!statSyncSafe(resolvedFilePath)?.isFile()) {
            continue;
          }
          const realResolvedFilePath = realpathSyncSafe(resolvedFilePath);
          visitedPaths.add(realResolvedFilePath);
          if (targetsBrowser) {
            const toPackageJson = findUpPackageJson(dirname(realResolvedFilePath));
            if (toPackageJson) {
              visitedPaths.add(toPackageJson.filePath);
              const to = matchBrowserField(toPackageJson, realResolvedFilePath);
              if (to !== undefined) {
                const remappedFilePath = resolveRemappedRequest(toPackageJson.directoryPath, to);
                if (remappedFilePath !== undefined) {
                  if (typeof remappedFilePath === "string") {
                    visitedPaths.add(remappedFilePath);
                  }
                  return {
                    resolvedFile: remappedFilePath,
                    originalFilePath: realResolvedFilePath,
                    visitedPaths,
                  };
                }
              }
            }
          }
          return { resolvedFile: realResolvedFilePath, visitedPaths };
        }
      }

      return { resolvedFile: undefined, visitedPaths };
    } finally {
      packageCache.clear();
    }
  }

  function matchBrowserField({ browserMappings, directoryPath }: ISanitizedPackageJson, filePath: string) {
    if (browserMappings === undefined) {
      return undefined;
    }
    for (const [from, to] of Object.entries(browserMappings)) {
      if (!isRelative(from)) {
        continue;
      }
      const fromPath = join(directoryPath, from);
      if (filePath === fromPath || (filePath.startsWith(fromPath) && resolveRelative(fromPath) === filePath)) {
        return to;
      }
    }
    return undefined;
  }

  function* requestsToTry(contextPath: string, request: string, visitedPaths: Set<string>) {
    const requestAlias = remapUsingAlias(request);
    let emittedCandidate = false;
    if (requestAlias !== undefined) {
      emittedCandidate = true;
      yield requestAlias;
    }

    if (!emittedCandidate && targetsBrowser && !isRelative(request)) {
      const fromPackageJson = findUpPackageJson(contextPath);
      if (fromPackageJson) {
        visitedPaths.add(fromPackageJson.filePath);
        const to = fromPackageJson.browserMappings?.[request];
        if (to !== undefined) {
          emittedCandidate = true;
          yield typeof to === "string" && isRelative(to) ? join(fromPackageJson.directoryPath, to) : to;
        }
      }
    }

    if (!emittedCandidate) {
      yield request;
    }
    const requestFallback = remapUsingFallback(request);
    if (requestFallback !== undefined) {
      yield requestFallback;
    }
  }

  function* nodeRequestPaths(contextPath: string, request: string, visitedPaths: Set<string>) {
    if (isRelative(request) || isAbsolute(request)) {
      const requestPath = resolve(contextPath, request);
      yield* fileRequestPaths(requestPath);
      yield* directoryRequestPaths(requestPath, visitedPaths);
    } else {
      yield* packageRequestPaths(contextPath, request, visitedPaths);
    }
  }

  /**
   * /path/to/target
   * /path/to/target.js
   * /path/to/target.json
   */
  function* fileRequestPaths(filePath: string) {
    yield filePath;
    for (const ext of extensions) {
      yield filePath + ext;
    }
  }

  /**
   * /path/to/target (+ext)
   * /path/to/target/index (+ext)
   */
  function* fileOrDirIndexRequestPaths(targetPath: string) {
    yield* fileRequestPaths(targetPath);
    yield* fileRequestPaths(join(targetPath, "index"));
  }

  function* directoryRequestPaths(directoryPath: string, visitedPaths: Set<string>) {
    if (!statSyncSafe(directoryPath)?.isDirectory()) {
      return;
    }
    const resolvedPackageJson = loadPackageJsonFromCached(directoryPath);
    if (resolvedPackageJson !== undefined) {
      visitedPaths.add(resolvedPackageJson.filePath);

      if (targetsBrowser && resolvedPackageJson.browser !== undefined) {
        yield* fileOrDirIndexRequestPaths(join(directoryPath, resolvedPackageJson.browser));
      }
      if (targetsEsm && resolvedPackageJson.module !== undefined) {
        yield* fileOrDirIndexRequestPaths(join(directoryPath, resolvedPackageJson.module));
      }
      if (resolvedPackageJson.main !== undefined) {
        yield* fileOrDirIndexRequestPaths(join(directoryPath, resolvedPackageJson.main));
      }
    }

    yield* fileRequestPaths(join(directoryPath, "index"));
  }

  function* packageRequestPaths(initialPath: string, request: string, visitedPaths: Set<string>): Generator<string> {
    const [packageName, innerPath] = parsePackageSpecifier(request);
    if (!packageName.length || (packageName.startsWith("@") && !packageName.includes("/"))) {
      return;
    }

    const ownPackageJson = findUpPackageJson(initialPath);
    if (request.startsWith("#")) {
      if (ownPackageJson?.imports !== undefined) {
        for (const matchedValue of matchConditionsField(
          ownPackageJson.imports,
          request,
          ownPackageJson.hasPatternImports,
        )) {
          if (isRelative(matchedValue)) {
            yield join(ownPackageJson.directoryPath, matchedValue);
          } else {
            yield* packageRequestPaths(initialPath, matchedValue, visitedPaths);
          }
        }
      }
      return;
    }

    if (ownPackageJson !== undefined) {
      visitedPaths.add(ownPackageJson.filePath);
      if (ownPackageJson.name === packageName) {
        if (ownPackageJson.exports !== undefined) {
          for (const matchedValue of matchConditionsField(
            ownPackageJson.exports,
            innerPath,
            ownPackageJson.hasPatternExports,
          )) {
            yield join(ownPackageJson.directoryPath, matchedValue);
          }
          return;
        }
      }
    }

    for (const packagesPath of packageRootsToPaths(initialPath)) {
      if (!statSyncSafe(packagesPath)?.isDirectory()) {
        continue;
      }
      const packageDirectoryPath = join(packagesPath, packageName);
      const resolvedPackageJson = loadPackageJsonFromCached(packageDirectoryPath);
      if (resolvedPackageJson !== undefined) {
        visitedPaths.add(resolvedPackageJson.filePath);
      }
      if (resolvedPackageJson?.exports !== undefined) {
        for (const matchedValue of matchConditionsField(
          resolvedPackageJson.exports,
          innerPath,
          resolvedPackageJson.hasPatternExports,
        )) {
          yield join(packageDirectoryPath, matchedValue);
        }
        return;
      }
      const requestInPackages = join(packagesPath, request);
      yield* fileRequestPaths(requestInPackages);
      yield* directoryRequestPaths(requestInPackages, visitedPaths);
    }
  }

  function* matchConditionsField(
    conditionsValue: PackageJson.ExportConditions,
    innerPath: string,
    hasPatternMatch?: boolean,
  ) {
    const exactMatchExports = conditionsValue[innerPath];
    if (exactMatchExports !== undefined) {
      for (const exactMatchValue of matchExportConditions(exactMatchExports, exportConditions)) {
        if (exactMatchValue === null) {
          break;
        }
        yield exactMatchValue;
      }
    } else if (hasPatternMatch) {
      for (const matchedPattern of matchSubpathPatterns(conditionsValue, innerPath, exportConditions)) {
        yield matchedPattern;
      }
    }
  }

  function* packageRootsToPaths(initialPath: string) {
    for (const packageRoot of packageRoots) {
      for (const directoryPath of pathChainToRoot(initialPath)) {
        yield join(directoryPath, packageRoot);
      }
    }
  }

  function findUpPackageJson(initialPath: string): ISanitizedPackageJson | undefined {
    for (const directoryPath of pathChainToRoot(initialPath)) {
      const resolvedPackageJson = loadPackageJsonFromCached(directoryPath);
      if (resolvedPackageJson) {
        return resolvedPackageJson;
      }
    }
    return undefined;
  }

  function loadPackageJsonFrom(directoryPath: string): ISanitizedPackageJson | undefined {
    const packageJsonPath = join(directoryPath, PACKAGE_JSON);

    if (!statSyncSafe(packageJsonPath)?.isFile()) {
      return undefined;
    }

    const packageJson = readJsonFileSyncSafe(packageJsonPath) as PackageJson | null | undefined;
    if (typeof packageJson !== "object" || packageJson === null) {
      return undefined;
    }
    const { main: mainField, module: moduleField, browser: browserField } = packageJson;

    const [desugerifiedExports, hasPatternExports] = desugarifyExportsField(packageJson.exports);

    let hasPatternImports = false;
    if (packageJson.imports !== undefined) {
      for (const key of Object.keys(packageJson.imports)) {
        if (key.includes("*")) {
          hasPatternImports = true;
          break;
        }
      }
    }

    return {
      name: packageJson.name,
      filePath: packageJsonPath,
      directoryPath,
      main: typeof mainField === "string" ? mainField : undefined,
      module: typeof moduleField === "string" ? moduleField : undefined,
      browser: typeof browserField === "string" ? browserField : undefined,
      browserMappings: typeof browserField === "object" && browserField !== null ? browserField : undefined,
      exports: desugerifiedExports,
      imports: packageJson.imports,
      hasPatternExports,
      hasPatternImports,
    };
  }

  function resolveRemappedRequest(directoryPath: string, to: string | false): string | false | undefined {
    if (to === false) {
      return to;
    } else if (typeof to === "string") {
      if (isRelative(to)) {
        return resolveRelative(join(directoryPath, to));
      } else {
        return to;
      }
    }
    return undefined;
  }

  function resolveRelative(request: string) {
    for (const filePath of fileOrDirIndexRequestPaths(request)) {
      if (statSyncSafe(filePath)?.isFile()) {
        return realpathSyncSafe(filePath);
      }
    }
    return undefined;
  }

  function statSyncSafe(path: string) {
    const { stackTraceLimit } = Error;
    try {
      Error.stackTraceLimit = 0;
      return statSync(path, statsNoThrowOptions);
    } catch {
      return undefined;
    } finally {
      Error.stackTraceLimit = stackTraceLimit;
    }
  }

  function realpathSyncSafe(itemPath: string): string {
    const { stackTraceLimit } = Error;
    try {
      Error.stackTraceLimit = 0;
      return nativeRealPathSync(itemPath);
    } catch {
      return itemPath;
    } finally {
      Error.stackTraceLimit = stackTraceLimit;
    }
  }

  /**
   * Generates a path chain from the current path to the root directory.
   *
   * @param currentPath The current path to start the chain from.
   * @yields The current path and continues to yield the parent directory path until the root directory is reached.
   */
  function* pathChainToRoot(currentPath: string) {
    let lastPath: string | undefined;
    while (lastPath !== currentPath) {
      yield currentPath;
      lastPath = currentPath;
      currentPath = dirname(currentPath);
    }
  }

  function readJsonFileSyncSafe(filePath: string): unknown {
    const { stackTraceLimit } = Error;
    try {
      Error.stackTraceLimit = 0;
      return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    } catch {
      return undefined;
    } finally {
      Error.stackTraceLimit = stackTraceLimit;
    }
  }
}

function wrapWithCache<K, T>(fn: (key: K) => T, cache = new Map<K, T>()): (key: K) => T {
  return (key: K) => {
    if (cache.has(key)) {
      return cache.get(key)!;
    } else {
      const result = fn(key);
      cache.set(key, result);
      return result;
    }
  };
}

type ParsedTemplate = { prefix: string };

/**
 * Create a function that accepts a string and returns T | undefined.
 * The remapper supports paths ending with "/*", both in key and value.
 */
export function createRequestRemapper<T extends string | false>(
  mapping: Record<string, T>,
): (request: string) => T | undefined {
  const parsedTemplateMap = new Map<string | ParsedTemplate, T | ParsedTemplate>();
  let hasTemplate = false;
  for (const [key, value] of Object.entries(mapping)) {
    let parsedKey: string | ParsedTemplate = key;
    let parsedValue: T | ParsedTemplate = value;
    if (key.endsWith("/*")) {
      hasTemplate = true;
      parsedKey = { prefix: key.slice(0, -1) };
      if (typeof value === "string" && value.endsWith("/*")) {
        parsedValue = { prefix: value.slice(0, -1) };
      }
    }
    parsedTemplateMap.set(parsedKey, parsedValue);
  }

  return hasTemplate
    ? (request) => getFromParsedTemplateMap(parsedTemplateMap, request)
    : (request) => parsedTemplateMap.get(request) as T | undefined;
}

function getFromParsedTemplateMap<T extends string | false>(
  map: Map<string | ParsedTemplate, T | ParsedTemplate>,
  request: string,
): T | undefined {
  for (const [key, value] of map) {
    const keyType = typeof key;
    if (keyType === "string") {
      if (request === key) {
        return value as T;
      }
    } else if (keyType === "object") {
      const { prefix: keyPrefix } = key as ParsedTemplate;
      if (request.startsWith(keyPrefix) && request.length > keyPrefix.length) {
        return typeof value === "object" ? ((value.prefix + request.slice(keyPrefix.length)) as T) : value;
      }
    }
  }
  return undefined;
}

// to avoid having to include @types/node
interface TracedErrorConstructor extends ErrorConstructor {
  stackTraceLimit?: number;
}
declare let Error: TracedErrorConstructor;

/**
 * Parse a package specifier into a tuple of package name and path in package.
 * Handles both scoped and non-scoped package specifiers and returns a default path of '.' if no path is specified.
 *
 * @param specifier - The package specifier to parse.
 * @example parsePackageSpecifier('react-dom') === ['react-dom', "."]
 * @example parsePackageSpecifier('react-dom/client') === ['react-dom', './client']
 * @example parsePackageSpecifier('@scope/package') === ['@scope/package', "."]
 * @example parsePackageSpecifier('@scope/package/dist/some-file') === ['@scope/package', './dist/some-file']
 */
function parsePackageSpecifier(specifier: string): readonly [packageName: string, pathInPackage: string] {
  const firstSlashIdx = specifier.indexOf("/");
  if (firstSlashIdx === -1) {
    return [specifier, "."];
  }
  const isScopedPackage = specifier.startsWith("@");
  if (isScopedPackage) {
    const secondSlashIdx = specifier.indexOf("/", firstSlashIdx + 1);
    return secondSlashIdx === -1
      ? [specifier, "."]
      : [specifier.slice(0, secondSlashIdx), "." + specifier.slice(secondSlashIdx)];
  } else {
    return [specifier.slice(0, firstSlashIdx), "." + specifier.slice(firstSlashIdx)];
  }
}

/**
 * Desugarify the `exports` field of a package.json file.
 *
 * If `exports` is a string or an array, it is converted to an object with a single key of `'.'`.
 * If `exports` is already an object and has a key of `'.'` or starts with `'./'`, it is returned as is.
 * Otherwise, `exports` is wrapped in an object with a single key of `'.'`.
 *
 * @param packageExports - The `exports` field of a package.json file.
 * @returns tuple containing the desugarified `exports` field, with a flag saying whether it includes pattern exports.
 */
function desugarifyExportsField(
  packageExports: PackageJson.Exports | undefined,
): [PackageJson.ExportConditions | undefined, boolean] {
  let hasPatternExports = false;
  if (packageExports === undefined || packageExports === null) {
    packageExports = undefined;
  } else if (typeof packageExports === "string" || Array.isArray(packageExports)) {
    packageExports = { ".": packageExports };
  } else {
    for (const key of Object.keys(packageExports)) {
      if (key.includes("*")) {
        hasPatternExports = true;
      }
      if (key !== "." && !key.startsWith("./")) {
        packageExports = { ".": packageExports };
        hasPatternExports = false;
        break;
      }
    }
  }
  return [packageExports, hasPatternExports];
}

function* matchExportConditions(
  conditionValue: PackageJson.Exports,
  exportConditions: Set<string>,
): Generator<string | null> {
  if (conditionValue === null || typeof conditionValue === "string") {
    yield conditionValue;
  } else if (typeof conditionValue === "object") {
    if (Array.isArray(conditionValue)) {
      for (const arrayItem of conditionValue) {
        yield* matchExportConditions(arrayItem, exportConditions);
      }
    } else {
      for (const [key, value] of Object.entries(conditionValue)) {
        if (key === "default" || exportConditions.has(key)) {
          yield* matchExportConditions(value, exportConditions);
        }
      }
    }
  }
}

function* matchSubpathPatterns(
  exportedSubpaths: PackageJson.ExportConditions,
  innerPath: string,
  exportConditions: Set<string>,
): Generator<string, void, undefined> {
  const matchedValues: string[] = [];
  for (const [patternKey, patternValue] of Object.entries(exportedSubpaths)) {
    const keyStarIdx = patternKey.indexOf("*");
    if (keyStarIdx === -1 || patternKey.indexOf("*", keyStarIdx + 1) !== -1) {
      continue;
    }
    const keyPrefix = patternKey.slice(0, keyStarIdx);
    if (!innerPath.startsWith(keyPrefix)) {
      continue;
    }
    const keySuffix = patternKey.slice(keyStarIdx + 1);
    if (keySuffix && !innerPath.endsWith(keySuffix)) {
      continue;
    }

    const starReplacement = innerPath.slice(keyPrefix.length, innerPath.length - keySuffix.length);

    for (const valueToMatch of matchExportConditions(patternValue, exportConditions)) {
      if (valueToMatch === null) {
        return;
      }
      matchedValues.push(valueToMatch.replace(/\*/g, starReplacement));
    }
  }
  yield* matchedValues;
}
