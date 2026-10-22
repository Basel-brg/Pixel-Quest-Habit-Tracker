import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// Resolve from the actual consumers, not a possibly unused top-level copy.
const mobile = createRequire(new URL("../artifacts/pixel-quest-mobile/package.json", import.meta.url));
const web = createRequire(new URL("../artifacts/pixel-quest/package.json", import.meta.url));
const api = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const childRequire = (parent, name) => createRequire(parent.resolve(name));
const cli = childRequire(childRequire(mobile, "expo/package.json"), "@expo/cli");
const forge = cli("node-forge");
const bracesRequire = childRequire(childRequire(api, "http-proxy-middleware"), "micromatch");
const braces = bracesRequire("braces");
const queryRequire = childRequire(mobile, "expo-router/package.json");
const queryString = queryRequire("query-string");
const uuidRequire = childRequire(childRequire(childRequire(mobile, "expo/package.json"), "@expo/config-plugins"), "xcode");
const uuid = uuidRequire("uuid");
const parserRequire = childRequire(web, "@tailwindcss/typography");

function runBounded(code) {
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", code], {
    timeout: 5000,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

test("RSA accepts valid signatures, with and without optional SHA-256 NULL parameters", () => {
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(1024);
  for (const algorithm of ["sha256", "sha1", "md5"]) {
    const md = forge.md[algorithm].create().update("security regression");
    assert.equal(publicKey.verify(md.digest().getBytes(), privateKey.sign(md)), true);
  }
  const md = forge.md.sha256.create().update("optional parameters");
  const signature = privateKey.sign(md);
  const digestInfo = forge.asn1.fromDer(publicKey.encrypt(signature, null).slice(-51));
  digestInfo.value[0].value.pop();
  const withoutNull = privateKey.sign(forge.asn1.toDer(digestInfo).getBytes(), null);
  assert.equal(publicKey.verify(md.digest().getBytes(), withoutNull), true);
});

test("RSA rejects nested DigestAlgorithm garbage (GHSA-86w9-cpqp-85rv)", () => {
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(1024);
  const md = forge.md.sha256.create().update("forged message");
  const digest = md.digest().getBytes();
  const { asn1 } = forge;
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const oid = () => node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes());
  const nil = () => node(asn1.Type.NULL, false, "");
  for (const children of [
    [oid(), nil(), node(asn1.Type.OCTETSTRING, false, "garbage")],
    [oid(), node(asn1.Type.OCTETSTRING, false, "")],
    [oid(), node(asn1.Type.NULL, false, "not empty")],
  ]) {
    const info = node(asn1.Type.SEQUENCE, true, [
      node(asn1.Type.SEQUENCE, true, children),
      node(asn1.Type.OCTETSTRING, false, digest),
    ]);
    const signature = privateKey.sign(asn1.toDer(info).getBytes(), null);
    assert.throws(() => publicKey.verify(digest, signature), /valid RSASSA-PKCS1-v1_5/);
  }
});

test("braces preserves normal glob compilation, ranges and expansion", () => {
  assert.equal(braces.compile("src/{app,lib}/*.js"), "src/(app|lib)/*.js");
  assert.deepEqual(braces.expand("{a,b}{1..3}"), ["a1", "a2", "a3", "b1", "b2", "b3"]);
  assert.equal(braces.stringify(braces.parse("a/{b,c}/d")), "a/{b,c}/d");
  assert.equal(braces.compile("{".repeat(100) + "x" + "}".repeat(100)).length > 0, true);
});

test("braces rejects deeply nested patterns in every public path (GHSA-vfj7-8cjw-p6xm)", () => {
  for (const pattern of [
    "{".repeat(4000) + "x" + "}".repeat(4000),
    "(".repeat(4000) + "x" + ")".repeat(4000),
    "{(".repeat(2000) + "x" + ")}".repeat(2000),
    "{".repeat(9000),
  ]) {
    for (const method of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => method(pattern), { name: "SyntaxError", message: /maximum nesting depth/ });
    }
  }
});

test("braces also guards caller-supplied ASTs, not only parsed strings", () => {
  const makeAst = () => {
    const root = { type: "root", nodes: [] };
    let node = root;
    for (let i = 0; i < 10000; i++) {
      const child = { type: "brace", nodes: [], parent: node };
      node.nodes.push(child);
      node = child;
    }
    node.nodes.push({ type: "text", value: "x", parent: node });
    return root;
  };
  for (const method of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => method(makeAst()), { name: "SyntaxError", message: /maximum nesting depth/ });
  }
});

test("xcode's CommonJS UUID consumer works and buffer bounds are checked (GHSA-w5hq-g745-h8pq)", () => {
  assert.equal(uuidRequire("uuid/package.json").version, "11.1.1");
  assert.equal(uuid.validate(uuid.v4()), true);
  for (const version of ["v3", "v5"]) {
    for (const offset of [-1, 1]) {
      assert.throws(() => uuid[version]("pixel-quest", uuid[version].DNS, new Uint8Array(16), offset), RangeError);
    }
  }
  assert.throws(() => uuid.v6({}, new Uint8Array(15)), RangeError);
  const xcode = uuidRequire("./lib/pbxProject");
  const project = new xcode("test.pbxproj");
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});

test("query-string keeps Expo URL parsing and stringifying behavior with the fixed ESM decoder", () => {
  const parsed = queryString.parse("name=Pixel+Quest&unicode=%E2%9C%93&item=a&item=b&bad=%E0%A4%A");
  assert.equal(parsed.name, "Pixel Quest");
  assert.equal(parsed.unicode, "✓");
  assert.deepEqual(parsed.item, ["a", "b"]);
  assert.equal(typeof parsed.bad, "string");
  assert.equal(queryString.stringify({ name: "Pixel Quest", item: ["a", "b"] }), "item=a&item=b&name=Pixel%20Quest");
});

test("malformed URL decoding finishes within a bounded process (GHSA-vcc3-ghjq-m6fr)", () => {
  runBounded(`
    const q = require(${JSON.stringify(queryRequire.resolve("query-string"))});
    const value = '%FF'.repeat(20000);
    if (q.parse('x=' + value).x !== value) process.exit(1);
  `);
});

test("flat selector parsing finishes within a bounded process (GHSA-rj75-hqrm-r3gf)", () => {
  assert.equal(parserRequire("postcss-selector-parser/package.json").version, "7.1.7");
  runBounded(`
    const parser = require(${JSON.stringify(parserRequire.resolve("postcss-selector-parser"))});
    const selector = '.a'.repeat(20000);
    if (parser().processSync(selector) !== selector) process.exit(1);
  `);
});
