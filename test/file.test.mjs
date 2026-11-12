// Run with: node --test software/shop-page/test/
// The page is one file that asks for nothing: no src, no link but "#"
// or data:, no network call of any kind, and a policy saying so.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(rel, new URL(".", import.meta.url)), "utf8");
const html = read("../index.html");

test("no src, and every href is # or data:", () => {
  assert.doesNotMatch(html, /\bsrc\s*=/i);
  for (const [, v] of html.matchAll(/\bhref\s*=\s*["']?([^"'\s>]*)/gi)) assert.match(v, /^(#|data:)/, v);
  assert.doesNotMatch(html, /\b(srcset|action|formaction|poster|background|ping)\s*=/i);
});

test("nothing that could reach the network", () => {
  for (const word of ["fetch", "XMLHttpRequest", "import", "url(", "@import", "WebSocket", "EventSource", "sendBeacon", "serviceWorker", "Worker(", "window.open", "location.href", "location.assign"]) {
    assert.equal(html.includes(word), false, word);
  }
});

test("one script with no attributes, one style", () => {
  assert.equal([...html.matchAll(/<script\b/gi)].length, 1);
  assert.match(html, /<script>/);
  assert.equal([...html.matchAll(/<style\b/gi)].length, 1);
});

test("its own policy forbids every request", () => {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(csp);
  assert.match(csp[1], /default-src 'none'/);
  assert.match(csp[1], /base-uri 'none'/);
  assert.match(csp[1], /form-action 'none'/);
});

test("without JavaScript it says it needs it", () => {
  assert.match(html, /<noscript><p class="msg">This page needs JavaScript to show the list\.<\/p><\/noscript>/);
});

test("MIT, by the authors", () => {
  const lic = read("../LICENSE");
  assert.match(lic, /^MIT License/);
  assert.match(lic, /Copyright \(c\) 2026 the authors/);
});
