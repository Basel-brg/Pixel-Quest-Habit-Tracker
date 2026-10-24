import assert from "node:assert/strict";
import { createRequire, findPackageJSON } from "node:module";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const from = (path) => createRequire(new URL(path, import.meta.url));
const child = (parent, name) => createRequire(parent.resolve(name));
const api = from("../artifacts/api-server/package.json");
const mobile = from("../artifacts/pixel-quest-mobile/package.json");
const spec = from("../lib/api-spec/package.json");
const orval = child(spec, "orval");
const parser = child(orval, "@scalar/openapi-parser");
const validator = child(parser, "@scalar/openapi-validator");
const ajv = child(child(validator, "@scalar/json-schema-validator"), "ajv");
const uri = ajv("fast-uri");
// json-magic is import-only; locate its actual consumer without requiring it.
const orvalDependency = (name) => createRequire(realpathSync(
  findPackageJSON(name, pathToFileURL(spec.resolve("orval"))),
));
const undiciRequire = orvalDependency("@scalar/json-magic");
const undiciPath = undiciRequire.resolve("undici");
const fixedZod = child(validator, "@scalar/types");
const zod3 = api("zod");

function bounded(code) {
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", `
    const assert = require("node:assert/strict");
    (async () => { ${code} })().catch(error => { console.error(error); process.exit(1); });
  `], { timeout: 8000, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

test("all Zod 3 consumers resolve to the exploit-tested patch", () => {
  const cli = child(child(mobile, "expo/package.json"), "@expo/cli");
  for (const consumer of [
    cli, mobile,
    from("../artifacts/pixel-quest/package.json"),
    from("../artifacts/mockup-sandbox/package.json"),
    from("../lib/db/package.json"),
    from("../lib/api-zod/package.json"),
  ]) {
    assert.equal(realpathSync(consumer.resolve("zod")), realpathSync(api.resolve("zod")));
  }
  assert.equal(fixedZod("zod/package.json").version, "4.6.7");
  assert.equal(orvalDependency("@orval/zod")("zod/package.json").version, "4.6.7");
});

// Test CJS and ESM, including the v4 implementation shipped inside Zod 3.
const zodEntries = ["zod", "zod/v3", "zod/v4", "zod/v4/mini"];
for (const entry of zodEntries) {
  for (const format of ["require", "import"]) {
    test(`oversized arrays fail before parsing elements (${entry}, ${format}; GHSA-mrhx-c7xc-m3w5)`, () => {
      const cjs = api.resolve(entry);
      const load = format === "require"
        ? `require(${JSON.stringify(cjs)})`
        : `await import(${JSON.stringify(pathToFileURL(cjs.replace(/\.cjs$/, ".js")).href)})`;
      bounded(`
        const z = ${load};
        let calls = 0;
        const element = z.custom(() => { calls++; return false; });
        const schema = z.array(element);
        const attack = Array(2_000_000).fill(null);
        const sync = schema.safeParse(attack);
        assert.equal(sync.success, false);
        assert.equal(sync.error.issues.length, 1);
        assert.equal(sync.error.issues[0].code, "too_big");
        assert.equal(calls, 0);
        const asyncResult = await schema.safeParseAsync(attack);
        assert.equal(asyncResult.success, false);
        assert.equal(asyncResult.error.issues.length, 1);
        assert.equal(calls, 0);
        const asyncSchema = z.array(z.custom(async () => { calls++; return false; }));
        assert.equal((await asyncSchema.safeParseAsync(attack)).success, false);
        assert.equal(calls, 0);
        assert.equal(z.array(z.number()).safeParse(Array(10001).fill(1)).success, false);
        assert.equal(z.array(z.number()).parse(Array(10000).fill(1)).length, 10000);
        assert.deepEqual(z.array(z.number()).parse([1, 2, 3]), [1, 2, 3]);
        assert.equal(z.array(z.number()).safeParse(["invalid"]).success, false);
      `);
    });
  }
}

test("Zod 3 retains array transforms, async refinements, bounds and error paths", async () => {
  assert.deepEqual(zod3.array(zod3.string().transform(Number)).parse(["1", "2"]), [1, 2]);
  assert.deepEqual(await zod3.array(zod3.number().refine(async n => n > 0)).parseAsync([1, 2]), [1, 2]);
  const result = zod3.object({ items: zod3.array(zod3.number()) }).safeParse({ items: ["bad"] });
  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues[0].path, ["items", 0]);
  assert.equal(zod3.array(zod3.number()).max(1).safeParse([1, 2]).success, false);
  assert.equal(zod3.array(zod3.number()).min(1).safeParse([]).success, false);
});

test("fast-uri rejects encoded schemes and malformed hosts, preserving relative references", () => {
  assert.equal(ajv("fast-uri/package.json").version, "3.1.9");
  for (const value of ["%6Aavascript:alert(1)", "%u006Aavascript:alert(1)"]) {
    assert.ok(uri.parse(value).error, "GHSA-w74x-v6f9-j3xg");
    assert.notEqual(uri.normalize(value), "javascript:alert(1)");
    assert.throws(() => uri.resolve("https://a.example/", value), /scheme is malformed/);
  }
  assert.equal(uri.equal("%68ttp://a/", "http://a/"), false);
  for (const value of ["http://a@b@evil.example/", "http://exa\tmple.com/", "http://exa\rmple.com/", "http://exa\nmple.com/"]) {
    assert.ok(uri.parse(value).error, "GHSA-wjr9-j795-jxcr");
  }
  const suffix = uri.serialize({ path: "javascript:alert(1)" }, { reference: "suffix" });
  assert.equal(uri.parse(suffix).scheme, undefined, "GHSA-333x-w4r6-6crp");
  const base = "https://example.com/docs/current/";
  for (const ref of ["../x", "a/../b"]) {
    assert.equal(uri.resolve(base, uri.normalize(ref)), uri.resolve(base, ref), "GHSA-xhq7-xmqj-769h");
  }
  assert.equal(uri.normalize("https://EXAMPLE.com/a/../b"), "https://example.com/b");
});

test("fixed Zod 4 rejects constrained oversized arrays before element parsing", async () => {
  const z = fixedZod("zod");
  let calls = 0;
  const schema = z.array(z.custom(() => { calls++; return false; })).max(10);
  for (const result of [
    schema.safeParse(Array(100000).fill(null)),
    await schema.safeParseAsync(Array(100000).fill(null)),
  ]) {
    assert.equal(result.success, false);
    assert.equal(result.error.issues[0].code, "too_big");
  }
  assert.equal(calls, 0);
});

test("Undici enforces uppercase and mixed-case response integrity (GHSA-f72v-6w45-q472)", async () => {
  assert.equal(undiciRequire("undici/package.json").version, "7.30.1");
  const { fetch } = undiciRequire("undici");
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update("expected").digest("base64");
  for (const algorithm of ["sha256", "SHA256", "Sha256"]) {
    await assert.rejects(fetch("data:text/plain,attacker", { integrity: `${algorithm}-${digest}` }), /fetch failed/);
    assert.equal(await (await fetch("data:text/plain,expected", { integrity: `${algorithm}-${digest}` })).text(), "expected");
  }
});

test("Undici excessive content-encoding response cannot crash the process (GHSA-xjj6-f33q-929c)", () => {
  bounded(`
    const net = require("node:net");
    const { fetch } = require(${JSON.stringify(undiciPath)});
    const server = net.createServer(socket => {
      socket.once("data", () => socket.end(
        "HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\\r\\nContent-Length: 10\\r\\nConnection: close\\r\\n\\r\\n"
      ));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      await assert.rejects(fetch("http://127.0.0.1:" + server.address().port), /fetch failed/);
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally { await new Promise(resolve => server.close(resolve)); }
  `);
});

test("EventSource bounds data-field and fragmented-line state (GHSA-4qv8-2p9j-2685)", { timeout: 5000 }, async () => {
  const { EventSourceStream } = undiciRequire("undici/lib/web/eventsource/eventsource-stream.js");
  for (const attack of ["fields", "chunks", "line"]) {
    const stream = new EventSourceStream({ maxEventSize: 1_000_000 });
    const failed = new Promise(resolve => stream.once("error", resolve));
    if (attack === "fields") {
      stream.write(Buffer.from("data:\n".repeat(stream.maxDataLines + 1)));
    } else if (attack === "chunks") {
      for (let i = 0; i <= stream.maxBufferedChunks; i++) stream.write(Buffer.from("x"));
    } else {
      stream.write(Buffer.from("data:" + "x".repeat(1_000_010)));
    }
    const error = await failed;
    assert.match(error.message, /message size exceeded/);
    stream.destroy();
  }
});

test("Express's body-parser survives malformed compressed requests (GHSA-27r3-jxmh-p828)", () => {
  const expressRequire = child(api, "express");
  assert.equal(expressRequire("body-parser/package.json").version, "2.4.0");
  bounded(`
    const express = require(${JSON.stringify(api.resolve("express"))});
    const http = require("node:http");
    const { gzipSync } = require("node:zlib");
    const app = express();
    app.use(express.json());
    app.post("/", (req, res) => res.json(req.body));
    app.use((err, req, res, next) => res.status(400).end("invalid body"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const send = body => new Promise((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1", port: server.address().port, method: "POST",
        headers: { "content-type": "application/json", "content-encoding": "gzip", "content-length": body.length }
      }, res => { res.resume(); res.once("end", () => resolve(res.statusCode)); });
      req.once("error", reject);
      req.end(body);
    });
    try {
      const valid = gzipSync(JSON.stringify({ ok: true }));
      assert.equal(await send(valid), 200);
      assert.ok([200, 400].includes(await send(Buffer.concat([valid, Buffer.from("trailing garbage")]))));
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await send(valid), 200);
    } finally { await new Promise(resolve => server.close(resolve)); }
  `);
});
