// Run with: node --test software/shop-page/test/
// The page carries its own copy of the unpack code; it must be the
// shell's (software/shell/js/shop-link.js), word for word.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

const here = new URL(".", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, here), "utf8");
export function region(text) {
  const a = text.indexOf("// -- unpack: begin --");
  const b = text.indexOf("// -- unpack: end --");
  assert.ok(a >= 0 && b > a, "no unpack region");
  return text.slice(a, b);
}

test("the page's unpack code is the shell's, character for character", () => {
  assert.equal(region(read("../index.html")), region(read("../../shell/js/shop-link.js")));
});

test("one character different is caught", () => {
  const page = region(read("../index.html"));
  const bent = page.replace("0xedb88320", "0xedb88321");
  assert.notEqual(bent, page);
  assert.notEqual(bent, region(read("../../shell/js/shop-link.js")));
});
