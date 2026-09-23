import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("a question becomes an explorable, saved and independently branched notebook", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const capture = async (name: string) => {
    const directory = process.env.IFFY_CAPTURE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, name), fullPage: true });
    }
  };
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Nothing happens in isolation." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /four-day workweek became/ }),
  ).toBeEnabled();
  await capture("home.png");
  const library=page.locator('.notebook-list');
  if(await library.locator('button').count()>8) {
    const canScroll=await library.evaluate(el=>{el.scrollTop=el.scrollHeight;const moved=el.scrollTop>0;el.scrollTop=0;return moved;});
    expect(canScroll).toBe(true);
  }
  await page.getByRole("button", { name: /four-day workweek became/ }).click();
  await expect(
    page.getByRole("heading", { name: "The four-day question", exact: true }),
  ).toBeVisible();
  const originalId = new URL(page.url()).searchParams.get("notebook");
  expect(originalId).toBeTruthy();
  await page
    .getByRole("button", { name: /Coverage gaps.*Explore consequence/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Coverage gaps", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Immediate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Coverage gaps.*Explore consequence/ }),
  ).toContainText("-35");
  await page.getByRole("button", { name: "Short term", exact: true }).click();
  await capture("graph.png");
  await page.getByRole("tab", { name: /Timeline/ }).click();
  await expect(
    page.getByRole("heading", { name: "Long term", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Sectors/ }).click();
  await page
    .getByRole("button", { name: /Explore this sector/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /A closer look:/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Perspectives/ }).click();
  await page
    .getByRole("button", { name: /Open authored perspectives/ })
    .click();
  await expect(page.locator(".debate-messages article")).toHaveCount(3);
  await capture("perspectives.png");
  await page.getByRole("button", { name: /Follow another path/ }).click();
  await page
    .getByRole("button", { name: /Public services receive funding/ })
    .click();
  await page.getByRole("button", { name: /Create alternative/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "The four-day question · alternative",
      exact: true,
    }),
  ).toBeVisible();
  const branchId = new URL(page.url()).searchParams.get("notebook");
  expect(branchId).not.toEqual(originalId);
  await page.getByRole("button", { name: /Pin notebook/ }).click();
  await expect(
    page.getByRole("button", { name: "✦ Pinned", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON ↓", exact: true })
    .click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const pieces: Buffer[] = [];
  for await (const piece of stream!) pieces.push(Buffer.from(piece));
  const exported = JSON.parse(Buffer.concat(pieces).toString("utf8"));
  expect(exported.metadata.mode).toBe("demo");
  expect(exported.metadata.parent_id).toBe(originalId);
  await page.getByRole("button", { name: /Compare changes/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "What moved when the assumption changed?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Coverage gaps" }),
  ).toContainText("-25");
  await expect(
    page.getByRole("row").filter({ hasText: "Coverage gaps" }),
  ).toContainText("+28");
  await capture("comparison.png");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "The four-day question · alternative",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "✦ Pinned", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Open original/ }).click();
  await expect(
    page.getByRole("heading", { name: "The four-day question", exact: true }),
  ).toBeVisible();
  const original = await page.request.get(`/api/simulation/${originalId}`);
  expect((await original.json()).data.nodes[2].duration.short_term).toBe(-25);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "The four-day question", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".mobile-library summary")).toBeVisible();
  await capture("mobile.png");
  await page.getByRole("tab", { name: /Timeline/ }).click();
  await expect(
    page.getByRole("heading", { name: "Long term", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("unsupported demo questions and unavailable services have recoverable error states", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /four-day workweek became/ }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "WHERE DOES YOUR CURIOSITY START?" })
    .fill("What if an unrelated new thing happened?");
  await page.getByRole("button", { name: /Explore the ripple/ }).click();
  await expect(
    page.getByRole("alert", { name: "Workspace error" }),
  ).toContainText("three examples");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.route("**/api/simulate", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { message: "The workspace is temporarily unavailable." },
      }),
    }),
  );
  await page.getByRole("button", { name: /four-day workweek became/ }).click();
  await expect(
    page.getByRole("alert", { name: "Workspace error" }),
  ).toContainText("temporarily unavailable");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.unroute("**/api/simulate");
  await page.route("**/api/simulate", route => route.fulfill({status:502,contentType:"text/plain",body:"upstream unavailable"}));
  await page.getByRole("button", { name: /four-day workweek became/ }).click();
  await expect(page.getByRole("alert", { name: "Workspace error" })).toContainText("temporarily unavailable");
  await expect(
    page.getByRole("button", { name: /Explore the ripple/ }),
  ).toBeEnabled();
});

test("invalid shared notebook links preserve the home screen and explain the error", async ({
  page,
}) => {
  await page.goto("/?notebook=not-a-uuid");
  await expect(
    page.getByRole("alert", { name: "Workspace error" }),
  ).toContainText("Invalid notebook ID");
  await expect(
    page.getByRole("heading", { name: "Nothing happens in isolation." }),
  ).toBeVisible();
});
