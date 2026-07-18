import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArlenPage,
  parseBahamutThread,
  parsePcGamerArticle,
  reconcileState,
} from "../src/monitor.js";

test("parses active and struck-through codes from the first post", () => {
  const html = `
    <section>
      <a data-floor="1">first floor</a>
      <article>
        <div class="c-article__content">
          <div>ACTIVE2026</div>
          <strike>EXPIRED2026</strike>
          <strike>WWMGLtiktok</strike>
        </div>
      </article>
    </section>
    <section>
      <a data-floor="2">reply</a>
      <article>
        <div class="c-article__content">REPLY2026</div>
      </article>
    </section>
  `;

  assert.deepEqual(parseBahamutThread(html), [
    { code: "ACTIVE2026", status: "active" },
    { code: "EXPIRED2026", status: "expired" },
    { code: "WWMGLTIKTOK", status: "expired" },
  ]);
});

test("parses active and expired codes from Arlen", () => {
  const html = `
    <main>
      <h2>有效兌換碼 2 個</h2>
      <button>MX8MYAYJ4Q 有效 複製</button>
      <button>jxt3ctjhwp 有效 複製</button>
      <h2>失效兌換碼 1 個</h2>
      <button>AMTRC8F3AJ 失效 複製</button>
    </main>
  `;

  assert.deepEqual(parseArlenPage(html), [
    { code: "MX8MYAYJ4Q", status: "active" },
    { code: "JXT3CTJHWP", status: "active" },
    { code: "AMTRC8F3AJ", status: "expired" },
  ]);
});

test("parses active and expired codes from PC Gamer", () => {
  const html = `
    <article>
      <h2>All active Where Winds Meet Codes</h2>
      <table>
        <tr><th>Code</th><th>Reward</th></tr>
        <tr><td>MEETINHM</td><td>150x Echo Jade</td></tr>
        <tr><td>hd4crchptn</td><td>3x Echo Jade</td></tr>
      </table>
      <h3>Expired Where Winds Meet Codes</h3>
      <ul>
        <li>WWMDEVTALK - expired reward</li>
      </ul>
    </article>
  `;

  assert.deepEqual(parsePcGamerArticle(html), [
    { code: "MEETINHM", status: "active" },
    { code: "HD4CRCHPTN", status: "active" },
    { code: "WWMDEVTALK", status: "expired" },
  ]);
});

test("first run creates a baseline without announcing old active codes", () => {
  const result = reconcileState(
    { initialized: false, codes: [] },
    [
      { code: "ACTIVE2026", status: "active" },
      { code: "EXPIRED2026", status: "expired" },
    ],
    "2026-06-19T00:00:00.000Z",
  );

  assert.equal(result.firstRun, true);
  assert.deepEqual(result.newActive, []);
  assert.deepEqual(result.state.codes, [
    {
      code: "ACTIVE2026",
      status: "active",
      firstSeenAt: "2026-06-19T00:00:00.000Z",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
    },
  ]);
});

test("later runs announce only unseen active codes", () => {
  const result = reconcileState(
    {
      initialized: true,
      codes: [
        {
          code: "KNOWN2026",
          status: "active",
          firstSeenAt: "2026-06-18T00:00:00.000Z",
          lastSeenAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    },
    [
      { code: "KNOWN2026", status: "active" },
      { code: "NEWCODE2026", status: "active" },
      { code: "OLD2026", status: "expired" },
    ],
    "2026-06-19T00:00:00.000Z",
  );

  assert.deepEqual(result.newActive, [
    { code: "NEWCODE2026", status: "active" },
  ]);
});

test("expired source codes are removed from stored state", () => {
  const result = reconcileState(
    {
      initialized: true,
      codes: [
        {
          code: "KNOWN2026",
          status: "active",
          firstSeenAt: "2026-06-18T00:00:00.000Z",
          lastSeenAt: "2026-06-18T00:00:00.000Z",
        },
        {
          code: "OLD2026",
          status: "active",
          firstSeenAt: "2026-06-18T00:00:00.000Z",
          lastSeenAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    },
    [
      { code: "KNOWN2026", status: "active" },
      { code: "OLD2026", status: "expired" },
    ],
    "2026-06-19T00:00:00.000Z",
  );

  assert.deepEqual(
    result.state.codes.map((entry) => entry.code),
    ["KNOWN2026"],
  );
});
