// Run with: node --test software/shop-page/test/
// The page's script, run as a phone would run it but on the shell's
// fake DOM (software/shell/test/fake-dom.mjs): a link from the shell
// shows exactly what is still to buy; a tap moves a thing to Got it and
// back; ticks outlive a reload but not a new list; a missing or damaged
// link says so and draws no rows.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { FakeElement, fakeDocument } from "../../shell/test/fake-dom.mjs";
import { pack, toCarry } from "../../shell/js/shop-link.js";
import { typicalList } from "../../shell/test/shop-fixtures.mjs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m,
  };
}
const brokenStorage = () => ({
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
});

// Open the page at a "#" part. Returns helpers to read what it shows.
function open(hash, storage = memoryStorage()) {
  const body = new FakeElement("body");
  const root = new FakeElement("main");
  root.className = "app";
  body.append(root);
  const listeners = {};
  const location = { hash };
  const errors = [];
  const ctx = vm.createContext({
    document: { ...fakeDocument, querySelector: (s) => body.querySelector(s) },
    location,
    localStorage: storage,
    TextDecoder,
    Date,
    addEventListener: (t, fn) => (listeners[t] ||= []).push(fn),
    console: { error: (...a) => errors.push(a), log() {} },
  });
  vm.runInContext(script, ctx);
  const page = {
    root,
    storage,
    errors,
    setHash(h) {
      location.hash = h;
      for (const fn of listeners.hashchange || []) fn();
    },
    text: (cls) => root.querySelector(cls)?.textContent ?? null,
    parts: () =>
      root.byClass("part").map((p) => ({
        section: p.querySelector("h2").textContent,
        got: p.classList.contains("got"),
        rows: p.byClass("row").map((r) => r.textContent),
      })),
    rows: () => root.byClass("row"),
    row: (name) => root.byClass("row").find((r) => r.querySelector(".name").textContent === name),
  };
  return page;
}
const rowText = (t) => t.name + (t.note ? (/^[0-9]+$/.test(t.note) ? "x" + t.note : t.note) : "") + (t.low ? "Low" : "");

// The shell's list, ticked things and all, as Shopping holds it.
function shellGroups() {
  const groups = typicalList(25).map((g) => ({ ...g, items: g.items.map((t, i) => ({ ...t, ticked: false, id: t.name, dinners: [] })) }));
  groups[0].items[0].ticked = true;
  groups[2].items.forEach((t) => (t.ticked = true)); // a whole part bought
  groups.at(-1).items.at(-1).ticked = true;
  return groups;
}

test("a link from the shell shows exactly what is still to buy", async () => {
  const carry = toCarry(shellGroups());
  const page = open("#" + (await pack(carry)));
  const total = carry.reduce((n, g) => n + g.items.length, 0);
  assert.equal(page.text(".count"), `0 of ${total}`);
  assert.equal(page.root.querySelector(".count").attributes["aria-label"], `0 of ${total} ticked`);
  assert.deepEqual(page.parts(), carry.map((g) => ({ section: g.section, got: false, rows: g.items.map(rowText) })));
  assert.equal(page.text(".cut"), null);
  assert.match(page.text(".note"), /Ticks stay on this phone\. They don't go back to Marv/);
  assert.deepEqual(page.errors, []);
  // An amount of digits reads "x2"; one of words as it was written; Low in words.
  const p2 = open("#" + (await pack([{ section: "Produce", items: [{ name: "Lemons", note: "2", low: false }, { name: "Potatoes", note: "2 lb", low: true }] }])));
  assert.deepEqual(p2.rows().map((r) => r.textContent), ["Lemonsx2", "Potatoes2 lbLow"]);
  assert.equal(p2.row("Lemons").querySelector(".amount").textContent, "x2");
  assert.equal(p2.row("Potatoes").querySelector(".low").textContent, "Low");
});

test("a tap moves a thing to Got it at the foot; another brings it back to its place", async () => {
  const groups = typicalList(6);
  const page = open("#" + (await pack(groups)));
  const first = groups[0].items[0].name;
  page.row(first).click();
  assert.equal(page.text(".count"), "1 of 6");
  const parts = page.parts();
  assert.deepEqual(parts.at(-1), { section: "Got it", got: true, rows: [rowText({ ...groups[0].items[0], low: false })] });
  assert.equal(page.row(first).attributes["aria-pressed"], "true");
  assert.ok(!parts.slice(0, -1).some((p) => p.rows.includes(rowText(groups[0].items[0]))));
  page.row(first).click();
  assert.equal(page.text(".count"), "0 of 6");
  assert.deepEqual(page.parts().map((p) => p.rows), groups.map((g) => g.items.map(rowText)));
  for (const r of [...page.rows()]) page.row(r.querySelector(".name").textContent).click();
  assert.equal(page.text(".count"), "6 of 6");
  assert.equal(page.text(".done"), "All got.");
  assert.deepEqual(page.parts().map((p) => p.section), ["Got it"]);
});

test("ticks outlive a reload; a different list starts fresh", async () => {
  const hash = "#" + (await pack(typicalList(6)));
  const storage = memoryStorage();
  const a = open(hash, storage);
  a.row(typicalList(6)[1].items[0].name).click();
  a.row(typicalList(6)[0].items[1].name).click();
  const b = open(hash, storage);
  assert.equal(b.text(".count"), "2 of 6");
  assert.deepEqual(b.parts().at(-1).rows.length, 2);
  const c = open("#" + (await pack(typicalList(7))), storage);
  assert.equal(c.text(".count"), "0 of 7");
});

test("ten lists are kept, the oldest let go", async () => {
  const storage = memoryStorage();
  const hashes = [];
  for (let n = 1; n <= 11; n++) {
    hashes.push("#" + (await pack(typicalList(n))));
    open(hashes.at(-1), storage).rows()[0].click();
  }
  assert.equal(JSON.parse(storage.getItem("marv-shopping-list")).lists.length, 10);
  assert.equal(open(hashes[0], storage).text(".count"), "0 of 1");
  assert.equal(open(hashes[1], storage).text(".count"), "1 of 2");
  assert.equal(open(hashes[10], storage).text(".count"), "1 of 11");
});

test("a phone that won't keep anything still ticks, and shows no error", async () => {
  const page = open("#" + (await pack(typicalList(6))), brokenStorage());
  page.rows()[0].click();
  page.rows()[0].click();
  assert.equal(page.text(".count"), "2 of 6");
  assert.equal(page.text(".msg"), null);
  assert.deepEqual(page.errors, []);
});

test("no list in the link: how to get one", () => {
  for (const h of ["", "#"]) {
    const page = open(h);
    assert.equal(page.text(".msg"), "There's no list in this link. Ask Marv: Shopping, Take it with me, and point your phone's camera at the code.");
    assert.equal(page.rows().length, 0);
  }
});

test("a damaged link: says so, draws no rows, throws nothing", async () => {
  const hash = "#" + (await pack(typicalList(25)));
  const at = Math.floor(hash.length / 2);
  const bent = hash.slice(0, at) + (hash[at] === "A" ? "B" : "A") + hash.slice(at + 1);
  for (const h of [bent, "#2" + hash.slice(2), hash.slice(0, -1), "#1%%%"]) {
    const page = open(h);
    assert.equal(page.text(".msg"), "This link's list is damaged, so it can't be shown. Ask Marv: Shopping, Take it with me, for a fresh code.");
    assert.equal(page.rows().length, 0);
    assert.equal(page.text(".count"), null);
  }
});

test("a new link while open shows the new list", async () => {
  const page = open("#" + (await pack(typicalList(6))));
  page.setHash("#" + (await pack(typicalList(3))));
  assert.equal(page.text(".count"), "0 of 3");
  page.setHash("");
  assert.match(page.text(".msg"), /no list/);
});

test("a list cut short names what was left off", async () => {
  const groups = typicalList(25);
  const page = open("#" + (await pack(groups.slice(0, 2), ["Drinks", "Household"])));
  assert.equal(page.text(".cut"), "This code left some off: Drinks, Household.");
  assert.deepEqual(page.parts().map((p) => p.section), groups.slice(0, 2).map((g) => g.section));
});
