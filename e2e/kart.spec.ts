import { test, expect } from "@playwright/test";

test.describe("Produksjonskart og MapLibre-arbeider", () => {
  test("laster ekte MapLibre-worker og delte moduler uten 404", async ({ page }) => {
    const urls404: string[] = [];
    const consoleErrors: string[] = [];
    const requestedUrls: string[] = [];

    page.on("response", (res) => {
      if (res.status() === 404) {
        urls404.push(res.url());
      }
    });

    page.on("request", (req) => {
      requestedUrls.push(req.url());
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");

    // Vent på at kartklyngene tegnes på kartet
    const klynge = page.locator(".kart-klynge").first();
    await expect(klynge).toBeVisible({ timeout: 15_000 });

    // Sjekk at MapLibre-workeren og den delte modulen ble etterspurt og ikke ga 404
    const harWorker = requestedUrls.some((u) => u.includes("/maplibre/maplibre-gl-worker.mjs"));
    const harShared = requestedUrls.some((u) => u.includes("/maplibre/maplibre-gl-shared.mjs"));

    expect(harWorker).toBe(true);
    expect(harShared).toBe(true);

    const maplibre404 = urls404.filter((u) => u.includes("/maplibre/"));
    expect(maplibre404).toEqual([]);

    // Ingen kritiske konsollfeil fra arbeideren
    const workerFeil = consoleErrors.filter(
      (e) =>
        (e.toLowerCase().includes("maplibre") || e.toLowerCase().includes("worker") || e.includes("Unable to parse")) &&
        !e.includes("insights")
    );
    expect(workerFeil).toEqual([]);
  });

  test("klynger følger kartposisjonen under dragging", async ({ page }) => {
    await page.goto("/");

    const klynge = page.locator(".kart-klynge").first();
    await expect(klynge).toBeVisible({ timeout: 15_000 });

    const canvas = page.locator("canvas.maplibregl-canvas");
    await expect(canvas).toBeVisible();

    const forsteBoks = await klynge.boundingBox();
    expect(forsteBoks).not.toBeNull();
    if (!forsteBoks) return;

    const canvasBoks = await canvas.boundingBox();
    expect(canvasBoks).not.toBeNull();
    if (!canvasBoks) return;

    const startX = canvasBoks.x + canvasBoks.width / 2;
    const startY = canvasBoks.y + canvasBoks.height / 2;
    const dx = 120;
    const dy = 80;

    // Dra kartet med musen
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
    await page.mouse.up();

    // Gi kartet et lite øyeblikk til å fullføre bevegelsen
    await page.waitForTimeout(200);

    const nyBoks = await klynge.boundingBox();
    expect(nyBoks).not.toBeNull();
    if (!nyBoks) return;

    // Klyngen skal ha flyttet seg i samme retning som kartet ble dratt
    const faktiskDx = nyBoks.x - forsteBoks.x;
    const faktiskDy = nyBoks.y - forsteBoks.y;

    expect(faktiskDx).toBeGreaterThan(50);
    expect(faktiskDy).toBeGreaterThan(30);

    // Klyngen er fortsatt synlig og klikkbar
    await expect(klynge).toBeVisible();
  });
});
