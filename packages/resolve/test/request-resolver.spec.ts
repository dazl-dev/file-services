import * as chai from "chai";
import { expect } from "chai";
import type { PackageJson } from "type-fest";
import { createMemoryFs } from "@file-services/memory";
import { createRequestResolver } from "@file-services/resolve";
import { resolutionMatchers } from "./resolution-matchers.js";

chai.use(resolutionMatchers);
const stringifyPackageJson = (packageJson: PackageJson) => JSON.stringify(packageJson);
const EMPTY = "";

describe("request resolver", () => {
  describe("files", () => {
    it("resolves requests to any file if extension is specified", () => {
      const fs = createMemoryFs({
        src: {
          "typed.ts": EMPTY,
          "file.js": EMPTY,
          "data.json": EMPTY,
        },
        "style.css": EMPTY,
        "image.jpg": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./src/file.js")).to.be.resolvedTo("/src/file.js");
      expect(resolveRequest("/src", "./data.json")).to.be.resolvedTo("/src/data.json");
      expect(resolveRequest("/src", "./typed.ts")).to.be.resolvedTo("/src/typed.ts");
      expect(resolveRequest("/", "./style.css")).to.be.resolvedTo("/style.css");
      expect(resolveRequest("/", "./image.jpg")).to.be.resolvedTo("/image.jpg");
      expect(resolveRequest("/", "./non-existing.svg")).to.be.resolvedTo(undefined);
    });

    it("resolves requests to js and json files without specified extension", () => {
      const fs = createMemoryFs({
        src: {
          "file.js": EMPTY,
          "style.css.js": EMPTY,
        },
        "data.json": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./src/file")).to.be.resolvedTo("/src/file.js");
      expect(resolveRequest("/", "./data")).to.be.resolvedTo("/data.json");
      expect(resolveRequest("/src", "./style.css")).to.be.resolvedTo("/src/style.css.js");
      expect(resolveRequest("/src", "../data")).to.be.resolvedTo("/data.json");
    });

    it("allows specifying custom extensions for resolution", () => {
      const fs = createMemoryFs({
        src: {
          "same_name.tsx": EMPTY,
          "same_name.ts": EMPTY,
        },
        "file.ts": EMPTY,
        "another.tsx": EMPTY,
        "style.css.ts": EMPTY,
        "now_ignored.js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs, extensions: [".ts", ".tsx"] });

      expect(resolveRequest("/", "./file")).to.be.resolvedTo("/file.ts");
      expect(resolveRequest("/", "./another")).to.be.resolvedTo("/another.tsx");
      expect(resolveRequest("/src", "../style.css")).to.be.resolvedTo("/style.css.ts");
      expect(resolveRequest("/", "./now_ignored")).to.be.resolvedTo(undefined);

      // picked due to order of provided extensions array
      expect(resolveRequest("/src", "./same_name")).to.be.resolvedTo("/src/same_name.ts");
    });

    it("resolves requests to absolute paths", () => {
      const fs = createMemoryFs({
        src: {
          folder: {
            "file.js": EMPTY,
          },
        },
        folder: {
          "file.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/request/origin/matters/not", "/folder/file")).to.be.resolvedTo("/folder/file.js");
      // next one ensures we don't accidently resolve absolute paths using path.join
      // which would result in '/src/folder/file.js' instead
      expect(resolveRequest("/src", "/folder/file")).to.be.resolvedTo("/folder/file.js");
    });

    it("resolves requests to files across folders", () => {
      const fs = createMemoryFs({
        src: {
          "file.js": EMPTY,
        },
        "another.js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./src/file")).to.be.resolvedTo("/src/file.js");
      expect(resolveRequest("/demo", "../src/file")).to.be.resolvedTo("/src/file.js");
      expect(resolveRequest("/src/inner", "../file")).to.be.resolvedTo("/src/file.js");
      expect(resolveRequest("/src/inner", "../../another")).to.be.resolvedTo("/another.js");
    });

    it("resolves requests to dot files", () => {
      const fs = createMemoryFs({
        ".npmrc": EMPTY,
        ".js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./.npmrc")).to.be.resolvedTo("/.npmrc");
      // even if dot file is named as possible extension (which is probably improbable)
      expect(resolveRequest("/", "./.js")).to.be.resolvedTo("/.js");
    });
  });

  describe("folders", () => {
    it("resolves requests to a folder if it contains an index file", () => {
      const fs = createMemoryFs({
        src: {
          "index.js": EMPTY,
        },
        data: {
          "index.json": EMPTY,
        },
        typed: {
          "index.ts": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs, extensions: [".ts", ".js", ".json"] });

      expect(resolveRequest("/", "./src")).to.be.resolvedTo("/src/index.js");
      expect(resolveRequest("/", "./data")).to.be.resolvedTo("/data/index.json");
      expect(resolveRequest("/", "./typed")).to.be.resolvedTo("/typed/index.ts");
      expect(resolveRequest("/src", ".")).to.be.resolvedTo("/src/index.js");
      expect(resolveRequest("/src/inside", "..")).to.be.resolvedTo("/src/index.js");
    });

    it("resolves requests to a folder if it contains a package.json with a main", () => {
      const fs = createMemoryFs({
        with_ext: {
          "package.json": stringifyPackageJson({ main: "entry.js" }),
          "entry.js": EMPTY,
        },
        without_ext: {
          "package.json": stringifyPackageJson({ main: "main_file" }),
          "main_file.js": EMPTY,
        },
        to_inner_folder: {
          inner: { "index.js": EMPTY },
          "package.json": stringifyPackageJson({ main: "inner" }),
        },
        to_file_in_folder: {
          inner: { "file.js": EMPTY },
          "package.json": stringifyPackageJson({ main: "inner/file.js" }),
        },
        preferred: {
          "package.json": stringifyPackageJson({ main: "preferred.js" }),
          "preferred.js": "will be picked over index",
          "index.js": EMPTY,
        },
        dot_main: {
          "package.json": stringifyPackageJson({ main: "." }),
          "index.js": EMPTY,
        },
        empty_main: {
          "package.json": stringifyPackageJson({ main: "" }),
          "index.js": EMPTY,
        },
        missing_main: {
          "package.json": stringifyPackageJson({ main: "./missing" }),
        },
        invalid_json: {
          "package.json": "#invalid json#",
          "index.js": EMPTY,
        },
        invalid_json_no_index: {
          "package.json": "#invalid json#",
        },
        no_main: {
          "package.json": stringifyPackageJson({}),
          "index.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./with_ext")).to.be.resolvedTo("/with_ext/entry.js");
      expect(resolveRequest("/", "./without_ext")).to.be.resolvedTo("/without_ext/main_file.js");
      expect(resolveRequest("/", "./to_file_in_folder")).to.be.resolvedTo("/to_file_in_folder/inner/file.js");
      expect(resolveRequest("/", "./to_inner_folder")).to.be.resolvedTo("/to_inner_folder/inner/index.js");
      expect(resolveRequest("/", "./preferred")).to.be.resolvedTo("/preferred/preferred.js");
      expect(resolveRequest("/", "./dot_main")).to.be.resolvedTo("/dot_main/index.js");
      expect(resolveRequest("/", "./empty_main")).to.be.resolvedTo("/empty_main/index.js");
      expect(resolveRequest("/", "./missing_main")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "./invalid_json")).to.be.resolvedTo("/invalid_json/index.js");
      expect(resolveRequest("/", "./invalid_json_no_index")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "./no_main")).to.be.resolvedTo("/no_main/index.js");
    });
  });

  describe("packages", () => {
    it("resolves requests to packages in node_modules", () => {
      const fs = createMemoryFs({
        node_modules: {
          express: {
            "package.json": stringifyPackageJson({ main: "main.js" }),
            "main.js": EMPTY,
            "another_entry.js": EMPTY,
          },
          lodash: {
            "package.json": stringifyPackageJson({ main: "some-index" }),
            "some-index.js": EMPTY,
            "test-utils": {
              "index.js": EMPTY,
              "util1.js": EMPTY,
            },
          },
          "missing-main": {
            "package.json": stringifyPackageJson({ main: "main.js" }),
          },
          "just-a-file.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "express")).to.be.resolvedTo("/node_modules/express/main.js");

      expect(resolveRequest("/", "not-existing")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "missing-main")).to.be.resolvedTo(undefined);

      // alternative entry point
      expect(resolveRequest("/", "express/another_entry")).to.be.resolvedTo("/node_modules/express/another_entry.js");

      expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/some-index.js");

      // sub-folder of a package
      expect(resolveRequest("/", "lodash/test-utils")).to.be.resolvedTo("/node_modules/lodash/test-utils/index.js");

      // file in a sub-folder of a package
      expect(resolveRequest("/", "lodash/test-utils/util1")).to.be.resolvedTo(
        "/node_modules/lodash/test-utils/util1.js",
      );

      // should also be resolved to match node behavior
      expect(resolveRequest("/", "just-a-file")).to.be.resolvedTo("/node_modules/just-a-file.js");
    });

    it("resolves requests correctly when two versions of same package exist in tree", () => {
      const fs = createMemoryFs({
        node_modules: {
          express: {
            node_modules: {
              lodash: {
                "package.json": stringifyPackageJson({ main: "v1.js" }),
                "v1.js": EMPTY,
              },
            },
            "package.json": stringifyPackageJson({ main: "main.js" }),
            "main.js": EMPTY,
          },
          lodash: {
            "package.json": stringifyPackageJson({ main: "v2.js" }),
            "v2.js": EMPTY,
            "v2-specific-file.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({ fs });

      // local node_modules package overshadows the top level one
      expect(resolveRequest("/node_modules/express", "lodash")).to.be.resolvedTo(
        "/node_modules/express/node_modules/lodash/v1.js",
      );

      // root still gets v2
      expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/v2.js");

      // file only exists in top level package (ugly, but matches node's behavior)
      expect(resolveRequest("/node_modules/express", "lodash/v2-specific-file")).to.be.resolvedTo(
        "/node_modules/lodash/v2-specific-file.js",
      );
    });

    it("resolves requests to scoped packages", () => {
      const fs = createMemoryFs({
        node_modules: {
          "@scope": {
            package: {
              "index.js": EMPTY,
              "test-utils.js": EMPTY,
            },
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "@scope/package")).to.be.resolvedTo("/node_modules/@scope/package/index.js");

      expect(resolveRequest("/", "@scope/package/test-utils")).to.be.resolvedTo(
        "/node_modules/@scope/package/test-utils.js",
      );
    });

    it("allows specifying custom packages roots", () => {
      const fs = createMemoryFs({
        project: {
          third_party: {
            koa: {
              "package.json": stringifyPackageJson({ main: "main-index" }),
              "main-index.js": EMPTY,
            },
          },
        },
        root_libs: {
          react: {
            "index.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs, packageRoots: ["third_party", "/root_libs"] });

      expect(resolveRequest("/project", "koa")).to.be.resolvedTo("/project/third_party/koa/main-index.js");

      expect(resolveRequest("/project", "react")).to.be.resolvedTo("/root_libs/react/index.js");
    });

    it("loads new packages added since last resolution", () => {
      const fs = createMemoryFs({
        node_modules: {
          express: {
            "main.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "express")).to.be.resolvedTo(undefined);
      fs.writeFileSync("/node_modules/express/package.json", stringifyPackageJson({ main: "main.js" }));

      expect(resolveRequest("/", "express")).to.be.resolvedTo("/node_modules/express/main.js");
    });
  });

  describe("browser/module fields (string)", () => {
    it('uses "browser" if "main" and "module" were not defined', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ browser: "file.js" }),
          "file.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/file.js");
    });

    it('uses "module" if "main" and "browser" were not defined', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ module: "file.js" }),
          "file.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/file.js");
    });

    it('prefers "module" over "main"', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ main: "entry.js", module: "browser.js" }),
          "entry.js": EMPTY,
          "browser.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/browser.js");
    });

    it('prefers "browser" over "main" and "module"', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ main: "entry.js", module: "entry.js", browser: "./browser.js" }),
          "entry.js": EMPTY,
          "browser.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/browser.js");
    });

    it('falls back to "module" when "browser" cannot be resolved', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ module: "entry.js", browser: "missing-file.js" }),
          "entry.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/entry.js");
    });

    it('falls back to "main" when "module" cannot be resolved', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ main: "entry.js", module: "missing-file.js" }),
          "entry.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/entry.js");
    });

    it('falls back to "main" when both "browser" and "module" cannot be resolved', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({
            main: "entry.js",
            module: "missing-file.js",
            browser: "missing-file.js",
          }),
          "entry.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/entry.js");
    });

    it('prefers "main" over "module" and "browser" when conditions only include "node"', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ main: "entry.js", browser: "./browser.js", module: "./browser.js" }),
          "entry.js": EMPTY,
          "browser.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs, conditions: ["node"] });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/entry.js");
    });

    it('prefers "browser" over "main" and "module" when conditions only include "browser"', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ main: "entry.js", browser: "./browser.js", module: "entry.js" }),
          "entry.js": EMPTY,
          "browser.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs, conditions: ["browser"] });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/browser.js");
    });

    it('prefers "module" over "main" when conditions only include "import"', () => {
      const fs = createMemoryFs({
        lodash: {
          "package.json": stringifyPackageJson({ main: "entry.js", module: "./browser.js", browser: "entry.js" }),
          "entry.js": EMPTY,
          "browser.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs, conditions: ["import"] });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/browser.js");
    });

    it('resolves "browser" which points to a folder with an index file', () => {
      const fs = createMemoryFs({
        lodash: {
          browser: { "index.js": EMPTY },
          "package.json": stringifyPackageJson({ main: "entry.js", browser: "./browser" }),
          "entry.js": EMPTY,
        },
        "another-package": {
          browser: {},
          "package.json": stringifyPackageJson({ browser: "./browser" }),
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./lodash")).to.be.resolvedTo("/lodash/browser/index.js");
      expect(resolveRequest("/", "./another-package")).to.be.resolvedTo(undefined);
    });
  });

  describe("browser field (object)", () => {
    it("supports remapping files within the same project", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ browser: { "./file": "./file-browser" } }),
        "file.js": EMPTY,
        "file-browser.js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./file")).to.be.resolvedTo("/file-browser.js");
    });

    it("supports remapping of package to package", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ browser: { fs: "browser-fs" } }),
        node_modules: {
          "browser-fs": {
            "package.json": stringifyPackageJson({ main: "./file.js" }),
            "file.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "fs")).to.be.resolvedTo("/node_modules/browser-fs/file.js");
    });

    it("supports remapping of package to false (empty object)", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ browser: { fs: false } }),
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "fs")).to.be.resolvedTo(false);
    });

    it("supports remapping of a local file to false (empty object)", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ browser: { "./some-file.js": false } }),
        "some-file.js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./some-file")).to.be.resolvedTo(false);
      expect(resolveRequest("/", "./some-file").originalFilePath).to.equal("/some-file.js");
    });

    it("supports remapping of package to a relative file", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ browser: { fs: "./browser-fs" } }),
        "browser-fs.js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "fs")).to.be.resolvedTo("/browser-fs.js");
    });

    it("supports packages remapping their entrypoint", () => {
      const fs = createMemoryFs({
        node_modules: {
          "some-package": {
            "package.json": stringifyPackageJson({ main: "./file.js", browser: { "./file": "./file-browser" } }),
            "file.js": EMPTY,
            "file-browser.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "some-package")).to.be.resolvedTo("/node_modules/some-package/file-browser.js");
      expect(resolveRequest("/", "some-package/file")).to.be.resolvedTo("/node_modules/some-package/file-browser.js");
      expect(resolveRequest("/node_modules/some-package", "./file")).to.be.resolvedTo(
        "/node_modules/some-package/file-browser.js",
      );
    });

    it("supports linked packages remapping their entrypoint", () => {
      const fs = createMemoryFs({
        node_modules: {
          ".store": {
            "some-package@1.0.0": {
              "package.json": stringifyPackageJson({ main: "./file.js", browser: { "./file": "./file-browser" } }),
              "file.js": EMPTY,
              "file-browser.js": EMPTY,
            },
          },
        },
      });
      fs.symlinkSync(".store/some-package@1.0.0", "/node_modules/some-package");
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "some-package")).to.be.resolvedTo(
        "/node_modules/.store/some-package@1.0.0/file-browser.js",
      );
      expect(resolveRequest("/", "some-package/file")).to.be.resolvedTo(
        "/node_modules/.store/some-package@1.0.0/file-browser.js",
      );
      expect(resolveRequest("/node_modules/some-package", "./file")).to.be.resolvedTo(
        "/node_modules/.store/some-package@1.0.0/file-browser.js",
      );
    });

    it("ignores re-mapping when source/target are missing/invalid", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({
          browser: {
            "./file": 123 as unknown as string,
            "./missing-source": "./missing-target",
            "./another-missing": "./file",
          },
        }),
        "file.js": EMPTY,
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "./file")).to.be.resolvedTo("/file.js");
      expect(resolveRequest("/", "./missing-source")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "./another-missing")).to.be.resolvedTo(undefined);
    });
  });

  describe("exports field", () => {
    it("treats empty object as nothing can be imported", () => {
      const fs = createMemoryFs({
        node_modules: {
          lodash: {
            "package.json": stringifyPackageJson({ exports: {} }),
            "index.js": EMPTY,
            "entry.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "lodash")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "lodash/entry.js")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "lodash/package.json")).to.be.resolvedTo(undefined);
    });

    it("treats dot as package root", () => {
      const fs = createMemoryFs({
        node_modules: {
          lodash: {
            "package.json": stringifyPackageJson({ exports: { ".": "./entry.js" } }),
            "entry.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/entry.js");
      expect(resolveRequest("/", "lodash/entry.js")).to.be.resolvedTo(undefined);
    });

    // https://nodejs.org/api/packages.html#subpath-exports
    it("supports subpath exports", () => {
      const fs = createMemoryFs({
        node_modules: {
          lodash: {
            "package.json": stringifyPackageJson({ exports: { "./anything": "./f/file.js" } }),
            f: {
              "file.js": EMPTY,
            },
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "lodash/anything")).to.be.resolvedTo("/node_modules/lodash/f/file.js");
      expect(resolveRequest("/", "lodash/anything.js")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "lodash/f/anything.js")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "lodash/f/file.js")).to.be.resolvedTo(undefined);
    });

    // https://nodejs.org/api/packages.html#conditional-exports
    describe("conditional-exports", () => {
      it('supports the "default" condition', () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: { ".": { default: "./entry.js" } } }),
              "entry.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/entry.js");
        expect(resolveRequest("/", "lodash/entry.js")).to.be.resolvedTo(undefined);
      });

      it('picks up "browser", "import" and "require" coniditions', () => {
        const fs = createMemoryFs({
          node_modules: {
            esm: {
              "package.json": stringifyPackageJson({ exports: { ".": { import: "./entry.mjs" } } }),
              "entry.mjs": EMPTY,
            },
            cjs: {
              "package.json": stringifyPackageJson({ exports: { ".": { require: "./entry.js" } } }),
              "entry.js": EMPTY,
            },
            web: {
              "package.json": stringifyPackageJson({ exports: { ".": { browser: "./entry.mjs" } } }),
              "entry.mjs": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "esm")).to.be.resolvedTo("/node_modules/esm/entry.mjs");
        expect(resolveRequest("/", "cjs")).to.be.resolvedTo("/node_modules/cjs/entry.js");
        expect(resolveRequest("/", "web")).to.be.resolvedTo("/node_modules/web/entry.mjs");
      });

      // https://nodejs.org/api/packages.html#nested-conditions
      it("supports nested conditions", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({
                exports: {
                  ".": {
                    node: { import: "./entry.mjs", require: "./entry.cjs" },
                    browser: { import: "./entry.browser.mjs", require: "./entry.browser.cjs" },
                  },
                },
              }),
              "entry.cjs": EMPTY,
              "entry.mjs": EMPTY,
              "entry.browser.cjs": EMPTY,
              "entry.browser.mjs": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/entry.browser.mjs");
      });

      it("ignores any other condition by default", () => {
        const fs = createMemoryFs({
          node_modules: {
            with_types: {
              "package.json": stringifyPackageJson({
                exports: { ".": { types: "./entry.d.ts", require: "./entry.js" } },
              }),
              "entry.js": EMPTY,
              "entry.d.ts": EMPTY,
            },
            styling_lib: {
              "package.json": stringifyPackageJson({
                exports: { ".": { browser: { css: "./style.css" } } },
              }),
              "style.css": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "with_types")).to.be.resolvedTo("/node_modules/with_types/entry.js");
        expect(resolveRequest("/", "styling_lib")).to.be.resolvedTo(undefined);
      });

      it("allows specifying custom conditions", () => {
        const fs = createMemoryFs({
          node_modules: {
            with_types: {
              "package.json": stringifyPackageJson({
                exports: { ".": { types: "./entry.d.ts", require: "./entry.js" } },
              }),
              "entry.js": EMPTY,
              "entry.d.ts": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs, conditions: ["types"] });

        expect(resolveRequest("/", "with_types")).to.be.resolvedTo("/node_modules/with_types/entry.d.ts");
      });

      it("respects order of conditions", () => {
        const fs = createMemoryFs({
          node_modules: {
            dual: {
              "package.json": stringifyPackageJson({
                exports: { ".": { import: "./entry.mjs", require: "./entry.js" } },
              }),
              "entry.js": EMPTY,
              "entry.mjs": EMPTY,
            },
            dual_reversed: {
              "package.json": stringifyPackageJson({
                exports: { ".": { require: "./entry.js", import: "./entry.mjs" } },
              }),
              "entry.js": EMPTY,
              "entry.mjs": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "dual")).to.be.resolvedTo("/node_modules/dual/entry.mjs");
        expect(resolveRequest("/", "dual_reversed")).to.be.resolvedTo("/node_modules/dual_reversed/entry.js");
      });
    });

    // https://nodejs.org/api/packages.html#self-referencing-a-package-using-its-name
    it("supports self resolution", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ name: "lodash", exports: "main.js" }),
        "main.js": EMPTY,
        src: {
          "file.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/src", "lodash")).to.be.resolvedTo("/main.js");
    });

    describe("syntactic sugar", () => {
      // https://nodejs.org/api/packages.html#main-entry-point-export
      it('treats string-value "exports" field as { ".": "the-string" }', () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: "./entry.js" }),
              "entry.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/entry.js");
      });

      it('treats root conditions as { "." : { ...conditions } }', () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: { browser: "./entry.browser.js", default: "entry.js" } }),
              "entry.js": EMPTY,
              "entry.browser.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/entry.browser.js");
      });

      it('treats Array-value "exports" field as { ".": [...] }', () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: ["./entry.js"] }),
              "entry.js": EMPTY,
            },
            no_entry: {
              "package.json": stringifyPackageJson({ exports: ["./entry.js"] }),
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo("/node_modules/lodash/entry.js");
        expect(resolveRequest("/", "no_entry")).to.be.resolvedTo(undefined);
      });
    });

    // https://nodejs.org/api/packages.html#subpath-patterns
    describe("subpath patterns", () => {
      it("supports pattern matching for files", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: { "./features/*.js": "./src/features/*.js" } }),
              src: {
                features: {
                  "a.js": EMPTY,
                  "b.css": EMPTY,
                  deep: {
                    "inner.js": EMPTY,
                  },
                },
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash/features/a.js")).to.be.resolvedTo("/node_modules/lodash/src/features/a.js");
        expect(resolveRequest("/", "lodash/features/b.css")).to.be.resolvedTo(undefined);
        expect(resolveRequest("/", "lodash/features/deep/inner.js")).to.be.resolvedTo(
          "/node_modules/lodash/src/features/deep/inner.js",
        );
      });

      it("supports pattern matching with multiple replacements for files", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({
                exports: {
                  "./features/*.js": "./src/features/*/*.js",
                },
              }),
              src: {
                features: {
                  a: {
                    "a.js": EMPTY,
                  },
                  b: {
                    b: {
                      b: {
                        "b.js": EMPTY,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash/features/a.js")).to.be.resolvedTo(
          "/node_modules/lodash/src/features/a/a.js",
        );
        expect(resolveRequest("/", "lodash/features/b/b.js")).to.be.resolvedTo(
          "/node_modules/lodash/src/features/b/b/b/b.js",
        );
      });

      it("supports pattern matching with no replacements for files", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({
                exports: {
                  "./features/*.js": "./src/features/a.js",
                },
              }),
              src: {
                features: {
                  "a.js": EMPTY,
                },
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash/features/a.js")).to.be.resolvedTo("/node_modules/lodash/src/features/a.js");
        expect(resolveRequest("/", "lodash/features/b.js")).to.be.resolvedTo("/node_modules/lodash/src/features/a.js");
        expect(resolveRequest("/", "lodash/features/b/b.js")).to.be.resolvedTo(
          "/node_modules/lodash/src/features/a.js",
        );
      });

      it("supports exclusion of subfolders", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({
                exports: {
                  "./features/*.js": "./src/features/*.js",
                  "./features/private-internal/*": null,
                },
              }),
              src: {
                features: {
                  "a.js": EMPTY,
                  "private-internal": {
                    "internal.js": EMPTY,
                  },
                },
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash/features/a.js")).to.be.resolvedTo("/node_modules/lodash/src/features/a.js");
        expect(resolveRequest("/", "lodash/features/private-internal/internal.js")).to.be.resolvedTo(undefined);
      });

      it("supports remapping entire contents of a package", () => {
        const fs = createMemoryFs({
          node_modules: {
            tslib: {
              "package.json": stringifyPackageJson({ exports: { "./*": "./*" } }),
              "tslib.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "tslib/tslib.js")).to.be.resolvedTo("/node_modules/tslib/tslib.js");
      });

      it("picks first match, even if there are several that match", () => {
        const fs = createMemoryFs({
          node_modules: {
            tslib: {
              "package.json": stringifyPackageJson({ exports: { "./dist/*": "./dist/*.js", "./*": "./*" } }),
              dist: {
                "file.js": EMPTY,
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "tslib/dist/file")).to.be.resolvedTo("/node_modules/tslib/dist/file.js");
      });

      it("supports patterns with nested conditions", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({
                exports: {
                  "./api/*": { custom: ["./src/second/*.ts", "./src/second/*.tsx"], default: "./src/first/*" },
                },
              }),
              src: {
                first: {
                  "a.ts": EMPTY,
                  "b.tsx": EMPTY,
                },
                second: {
                  "a.ts": EMPTY,
                  "b.tsx": EMPTY,
                },
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });
        expect(resolveRequest("/", "lodash/api/a.ts")).to.be.resolvedTo("/node_modules/lodash/src/first/a.ts");
        expect(resolveRequest("/", "lodash/api/b.tsx")).to.be.resolvedTo("/node_modules/lodash/src/first/b.tsx");

        const customResolve = createRequestResolver({ fs, conditions: ["custom"] });
        expect(customResolve("/", "lodash/api/a")).to.be.resolvedTo("/node_modules/lodash/src/second/a.ts");
        expect(customResolve("/", "lodash/api/b")).to.be.resolvedTo("/node_modules/lodash/src/second/b.tsx");
      });
    });

    describe("no cjs resolution leakage", () => {
      it("does not append extensions to export targets", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: { ".": "./entry" } }),
              "entry.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo(undefined);
      });

      it("does not allow mapping to folder root (no index.js appending)", () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: { ".": "./f" } }),
              f: {
                "index.js": EMPTY,
              },
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash")).to.be.resolvedTo(undefined);
      });
    });

    describe("edge cases", () => {
      it('treats "exports": null as not defined (matches node behavior)', () => {
        const fs = createMemoryFs({
          node_modules: {
            lodash: {
              "package.json": stringifyPackageJson({ exports: null }),
              "entry.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "lodash/entry.js")).to.be.resolvedTo("/node_modules/lodash/entry.js");
      });

      it('resolves "<package-name>/" only if ./ is allowed', () => {
        const fs = createMemoryFs({
          node_modules: {
            disallowed: {
              "package.json": stringifyPackageJson({ exports: { ".": "./entry.js" } }),
              "entry.js": EMPTY,
            },
            allowed: {
              "package.json": stringifyPackageJson({ exports: { ".": "./entry.js", "./": "./entry.js" } }),
              "entry.js": EMPTY,
            },
          },
        });
        const resolveRequest = createRequestResolver({ fs });

        expect(resolveRequest("/", "disallowed/")).to.be.resolvedTo(undefined);
        expect(resolveRequest("/", "allowed/")).to.be.resolvedTo("/node_modules/allowed/entry.js");
      });
    });
  });

  // https://nodejs.org/api/packages.html#imports
  describe("imports field", () => {
    it("treats empty object as nothing can be imported", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({ imports: {} }),
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "#lodash")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "#fs")).to.be.resolvedTo(undefined);
      expect(resolveRequest("/", "#another")).to.be.resolvedTo(undefined);
    });

    it("supports mapping of a specifier to another", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({
          imports: {
            "#lodash": "lodash",
          },
        }),
        node_modules: {
          lodash: {
            "index.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "#lodash")).to.be.resolvedTo("/node_modules/lodash/index.js");
    });

    it("supports mapping to a local file", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({
          imports: {
            "#react": "./vendor/react.js",
          },
        }),
        vendor: {
          "react.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "#react")).to.be.resolvedTo("/vendor/react.js");
    });

    it("supports different mapping for different resolution conditions", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({
          imports: {
            "#dep": {
              node: "dep-node-native",
              default: "./dep-polyfill.js",
            },
          },
        }),
        "dep-polyfill.js": EMPTY,
        node_modules: {
          "dep-node-native": {
            "package.json": stringifyPackageJson({ main: "main.js" }),
            "main.js": EMPTY,
          },
        },
      });

      const resolveBrowserRequest = createRequestResolver({ fs });
      expect(resolveBrowserRequest("/", "#dep")).to.be.resolvedTo("/dep-polyfill.js");

      const resolveNodeRequest = createRequestResolver({ fs, conditions: ["node"] });
      expect(resolveNodeRequest("/", "#dep")).to.be.resolvedTo("/node_modules/dep-node-native/main.js");
    });

    // https://nodejs.org/api/packages.html#subpath-patterns
    it("supports subpath imports", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({
          imports: {
            "#internal/*": "./src/internal/*.js",
          },
        }),
        src: {
          internal: {
            "a.js": EMPTY,
            deep: {
              "b.js": EMPTY,
            },
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      expect(resolveRequest("/", "#internal/a")).to.be.resolvedTo("/src/internal/a.js");
      expect(resolveRequest("/", "#internal/deep/b")).to.be.resolvedTo("/src/internal/deep/b.js");
    });
  });

  describe("alias", () => {
    it("remaps package requests to other package requests", () => {
      const fs = createMemoryFs({
        node_modules: {
          a: {
            "index.js": EMPTY,
            "other.js": EMPTY,
          },
          b: {
            "index.js": EMPTY,
            "other.js": EMPTY,
          },
          c: {
            subfolder: {
              "index.js": EMPTY,
            },
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        alias: {
          a: "b",
          "a/other": "b/other",
          "a/missing": "a/index",
          xyz: "c/subfolder",
        },
      });

      expect(resolveRequest("/", "a")).to.be.resolvedTo("/node_modules/b/index.js");
      expect(resolveRequest("/", "a/other")).to.be.resolvedTo("/node_modules/b/other.js");
      expect(resolveRequest("/", "a/other.js")).to.be.resolvedTo("/node_modules/a/other.js");
      expect(resolveRequest("/", "a/missing")).to.be.resolvedTo("/node_modules/a/index.js");
      expect(resolveRequest("/", "xyz")).to.be.resolvedTo("/node_modules/c/subfolder/index.js");
    });

    it("remaps package requests to absolute paths of files/dirs", () => {
      const fs = createMemoryFs({
        node_modules: {
          a: {
            "index.js": EMPTY,
          },
          b: {
            "index.js": EMPTY,
          },
        },
        polyfills: {
          "index.js": EMPTY,
          "b.js": EMPTY,
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        alias: {
          a: "/polyfills",
          b: "/polyfills/b.js",
        },
      });

      expect(resolveRequest("/", "a")).to.be.resolvedTo("/polyfills/index.js");
      expect(resolveRequest("/", "b")).to.be.resolvedTo("/polyfills/b.js");
    });

    it("remaps requests using pattern ending with /*", () => {
      const fs = createMemoryFs({
        node_modules: {
          a: {
            "index.js": EMPTY,
            "other.js": EMPTY,
          },
          b: {
            "index.js": EMPTY,
            "other.js": EMPTY,
          },
          c: {
            "index.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        alias: {
          "a/*": "b/*",
          a: "c",
        },
      });

      expect(resolveRequest("/", "a")).to.be.resolvedTo("/node_modules/c/index.js");
      expect(resolveRequest("/", "a/other")).to.be.resolvedTo("/node_modules/b/other.js");
      expect(resolveRequest("/", "a/index.js")).to.be.resolvedTo("/node_modules/b/index.js");
    });

    it("resolves as usual when provided with an empty alias record", () => {
      const fs = createMemoryFs({
        node_modules: {
          a: {
            "index.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        alias: {},
      });

      expect(resolveRequest("/", "a")).to.be.resolvedTo("/node_modules/a/index.js");
    });

    it("allows remapping package requests to false", () => {
      const fs = createMemoryFs();

      const resolveRequest = createRequestResolver({
        fs,
        alias: { anything: false },
      });

      expect(resolveRequest("/", "anything")).to.be.resolvedTo(false);
    });

    it("uses correct context for alias resolution", () => {
      const fs = createMemoryFs({
        node_modules: {
          some_package: {
            node_modules: {
              remapped: {
                "index.js": EMPTY,
              },
            },
          },
          target: {
            "index.js": EMPTY,
          },
          remapped: {
            "index.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        alias: {
          target: "remapped",
        },
      });

      expect(resolveRequest("/node_modules/some_package", "target")).to.be.resolvedTo(
        "/node_modules/some_package/node_modules/remapped/index.js",
      );
    });

    it("does not use original request if cannot find mapped", () => {
      const fs = createMemoryFs({
        node_modules: {
          react: {
            "index.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        alias: { react: "missing" },
      });

      expect(resolveRequest("/", "react")).to.be.resolvedTo(undefined);
    });
  });

  describe("fallback", () => {
    it("remaps package requests to fallback requests when cannot resolve", () => {
      const fs = createMemoryFs({
        node_modules: {
          a: {
            "package.json": stringifyPackageJson({ browser: { path: false } }),
          },
          b: {
            "index.js": EMPTY,
          },
        },
        polyfills: {
          "path.js": EMPTY,
          "os.js": EMPTY,
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        fallback: {
          path: "/polyfills/path.js",
          os: "/polyfills/os.js",
        },
      });

      expect(resolveRequest("/", "path")).to.be.resolvedTo("/polyfills/path.js");
      expect(resolveRequest("/node_modules/a", "path")).to.be.resolvedTo(false);
      expect(resolveRequest("/node_modules/a", "os")).to.be.resolvedTo("/polyfills/os.js");
    });

    it("supports fallbacks using pattern ending with /*", () => {
      const fs = createMemoryFs({
        node_modules: {
          b: {
            "index.js": EMPTY,
            "other.js": EMPTY,
          },
          c: {
            "index.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        fallback: {
          "a/*": "b/*",
          a: "c",
        },
      });

      expect(resolveRequest("/", "a")).to.be.resolvedTo("/node_modules/c/index.js");
      expect(resolveRequest("/", "a/other")).to.be.resolvedTo("/node_modules/b/other.js");
      expect(resolveRequest("/", "a/index.js")).to.be.resolvedTo("/node_modules/b/index.js");
    });

    it("uses correct context for fallback resolution", () => {
      const fs = createMemoryFs({
        node_modules: {
          some_package: {
            node_modules: {
              remapped: {
                "index.js": EMPTY,
              },
            },
          },
          remapped: {
            "index.js": EMPTY,
          },
        },
      });

      const resolveRequest = createRequestResolver({
        fs,
        fallback: {
          target: "remapped",
        },
      });

      expect(resolveRequest("/node_modules/some_package", "target")).to.be.resolvedTo(
        "/node_modules/some_package/node_modules/remapped/index.js",
      );
    });
  });

  describe("tracking", () => {
    it("lists all paths it visited to resolve the request", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({}),
        src: {
          "index.js": EMPTY,
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      const resolutionOutput = resolveRequest("/", "./src");
      expect(resolutionOutput).to.be.resolvedTo("/src/index.js");
      expect(Array.from(resolutionOutput.visitedPaths)).to.eql([
        "/src",
        "/src.js",
        "/src.json",
        "/src/index",
        "/src/index.js",
        "/package.json",
      ]);
    });

    it("lists paths for package.json files it met inside packages", () => {
      const fs = createMemoryFs({
        "package.json": stringifyPackageJson({}),
        node_modules: {
          some_package: {
            alt: {
              "package.json": stringifyPackageJson({
                name: "some_package/alt",
                main: "../actual.js",
                private: true,
              }),
            },
            "actual.js": EMPTY,
          },
        },
      });
      const resolveRequest = createRequestResolver({ fs });

      const resolutionOutput = resolveRequest("/", "some_package/alt");
      expect(resolutionOutput).to.be.resolvedTo("/node_modules/some_package/actual.js");
      expect(Array.from(resolutionOutput.visitedPaths)).to.eql([
        "/package.json",
        "/node_modules/some_package/alt",
        "/node_modules/some_package/alt.js",
        "/node_modules/some_package/alt.json",
        "/node_modules/some_package/alt/package.json",
        "/node_modules/some_package/actual.js",
      ]);
    });
  });
});
