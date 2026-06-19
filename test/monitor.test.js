import test from "node:test";
import assert from "node:assert/strict";
import { parseBahamutThread, reconcileState } from "../src/monitor.js";

test("parses active and struck-through codes from the first post", () => {
  const html = `
    <section>
      <a data-floor="1">樓主</a>
      <article>
        <div class="c-article__content">
          <div>兌換碼</div>
          <div>ACTIVE2026</div>
          <strike>EXPIRED2026</strike>
          <strike>WWMGLtiktok</strike>
        </div>
      </article>
    </section>
    <section>
      <a data-floor="2">二樓</a>
      <article>
        <div class="c-article__content">兌換碼 REPLY2026</div>
      </article>
    </section>
  `;

  assert.deepEqual(parseBahamutThread(html), [
    { code: "ACTIVE2026", status: "active" },
    { code: "EXPIRED2026", status: "expired" },
    { code: "WWMGLtiktok", status: "expired" },
  ]);
});

test("first run creates a baseline without announcing old codes", () => {
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
  assert.equal(result.state.codes.length, 2);
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
