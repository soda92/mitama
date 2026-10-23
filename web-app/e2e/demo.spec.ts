import { expect, test } from "@playwright/test";

test("shop demo boots and renders a frame", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".status")).toContainText("playing", { timeout: 10_000 });
  await page.waitForTimeout(3_000);

  const stats = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  });

  expect(stats).not.toBeNull();
  expect(stats!.max - stats!.min).toBeGreaterThan(20);
  expect(errors).toEqual([]);

  await page.screenshot({ path: "test-results/demo.png" });
});
