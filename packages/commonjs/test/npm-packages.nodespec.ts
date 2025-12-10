import { createCjsModuleSystem } from "@file-services/commonjs";
import fs from "@file-services/node";
import path from "@file-services/path";
import { createRequestResolver } from "@file-services/resolve";
import { expect } from "chai";
import events from "node:events";
import os from "node:os";
import perf_hooks from "node:perf_hooks";
import stream from "node:stream";
import tty from "node:tty";
import url from "node:url";
import util from "node:util";

describe("commonjs module system - integration with existing npm packages", function () {
  this.timeout(10_000); // 10s

  it("evaluates react/react-dom successfully", () => {
    const { requireFrom } = createCjsModuleSystem({ fs });

    const React = requireFrom(import.meta.dirname, "react") as typeof import("react");
    const ReactDOM = requireFrom(import.meta.dirname, "react-dom") as typeof import("react-dom");

    expect(React.createElement).to.be.instanceOf(Function);
    expect(React.Component).to.be.instanceOf(Function);
    expect(ReactDOM.createPortal).to.be.instanceOf(Function);
  });

  it("evaluates postcss successfully", () => {
    const { requireFrom, moduleCache } = createCjsModuleSystem({
      fs,
      resolver: createRequestResolver({ fs, conditions: ["node", "require"] }),
    });
    moduleCache.set("path", { filename: "path", id: "path", exports: path, children: [] });
    moduleCache.set("url", { filename: "url", id: "url", exports: url, children: [] });
    moduleCache.set("tty", { filename: "tty", id: "tty", exports: tty, children: [] });
    moduleCache.set("fs", { filename: "fs", id: "fs", exports: fs, children: [] });
    const postcss = requireFrom(import.meta.dirname, "postcss") as typeof import("postcss");

    expect(postcss.parse).to.be.instanceOf(Function);
  });

  it("evaluates typescript successfully", () => {
    const { requireFrom, moduleCache } = createCjsModuleSystem({ fs });
    moduleCache.set("fs", { filename: "fs", id: "fs", exports: fs, children: [] });
    moduleCache.set("os", { filename: "os", id: "os", exports: os, children: [] });
    moduleCache.set("perf_hooks", { filename: "perf_hooks", id: "perf_hooks", exports: perf_hooks, children: [] });

    const ts = requireFrom(import.meta.dirname, "typescript") as typeof import("typescript");

    expect(ts.transpileModule).to.be.instanceOf(Function);
  });

  it("evaluates mocha successfully", () => {
    const { requireFrom, moduleCache } = createCjsModuleSystem({
      fs,
      resolver: createRequestResolver({ fs, conditions: ["node", "require"] }),
    });
    moduleCache.set("node:events", { filename: "events", id: "events", exports: events, children: [] });
    moduleCache.set("node:fs", { filename: "fs", id: "fs", exports: fs, children: [] });
    moduleCache.set("os", { filename: "os", id: "os", exports: os, children: [] });
    moduleCache.set("node:path", { filename: "path", id: "path", exports: path, children: [] });
    moduleCache.set("stream", { filename: "stream", id: "stream", exports: stream, children: [] });
    moduleCache.set("tty", { filename: "tty", id: "tty", exports: tty, children: [] });
    moduleCache.set("node:url", { filename: "url", id: "url", exports: url, children: [] });
    moduleCache.set("util", { filename: "util", id: "util", exports: util, children: [] });
    moduleCache.set("node:util", { filename: "util", id: "util", exports: util, children: [] });
    const mocha = requireFrom(import.meta.dirname, "mocha") as typeof import("mocha");

    expect(mocha.reporters).to.be.an("object");
  });
});
