import { test, expect, type Page } from "@playwright/test";

// Oslo sentrum: tett nok til at 500 m holder.
const OSLO = { latitude: 59.9139, longitude: 10.7522 };
const skjermbilder = process.env.NAER_SKJERMBILDER;

test.use({ geolocation: OSLO, permissions: ["geolocation"] });

async function apneNaerMeg(page: Page) {
  await page.goto("/");
  await expect(page.locator(".kart-klynge").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "📍 Nær meg" }).click();
  const kort = page.getByRole("complementary", { name: "Rundt deg" });
  await expect(kort).toBeVisible();
  return kort;
}

test.describe("Sjekk rundt meg", () => {
  test("viser nabolagsdom, bytter radius og åpner steder", async ({ page }) => {
    const kort = await apneNaerMeg(page);
    await expect(kort.getByText(/^Innen 500 m fra deg: \d+ steder/)).toBeVisible();
    await expect(kort.getByRole("radio", { name: "500 m" })).toBeChecked();
    if (skjermbilder) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${skjermbilder}/desktop.png` });
    }

    const varsel = kort.getByRole("link", { name: /Varsle meg/ });
    await expect(varsel).toHaveAttribute("href", "/varsling?lat=59.914&lng=10.752&km=2");

    await kort.getByText("1 km", { exact: true }).click();
    await expect(kort.getByText(/^Innen 1 km fra deg:/)).toBeVisible();

    await kort.getByRole("tab", { name: /Tryggest i nærheten/ }).click();
    await expect(kort.getByRole("tab", { name: /Tryggest i nærheten/ })).toHaveAttribute("aria-selected", "true");
    const forste = kort.getByRole("tabpanel").getByRole("button").first();
    const navn = (await forste.locator("span.font-bold").first().textContent())!;
    await forste.click();

    // Stedspanelet tar over plassen, og nabolagskortet kommer tilbake når det lukkes.
    const panel = page.getByRole("complementary", { name: `Om ${navn}` });
    await expect(panel).toBeVisible();
    await expect(kort).toBeHidden();
    await expect(page).toHaveURL(/\?sted=/);
    await panel.getByRole("button", { name: "Lukk" }).click();
    await expect(kort).toBeVisible();
    await expect(kort.getByRole("tab", { name: /Tryggest i nærheten/ })).toHaveAttribute("aria-selected", "true");

    // Fokus tilbake til stedet i listen, så Escape lukker kortet.
    await expect(forste).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(kort).toBeHidden();
  });

  test("varslingslenken fyller ut punkt og radius", async ({ page }) => {
    await page.goto("/varsling?lat=59.914&lng=10.752&km=5");
    test.skip(await page.getByText("Varsling kommer snart!").isVisible(), "Varsling er ikke konfigurert (miljøvariabler mangler)");
    await expect(page.getByText("Der du sjekket på kartet")).toBeVisible();
    await expect(page.locator('input[name="km"][value="5"]')).toBeChecked();
  });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 820, height: 1180 },
  ]) {
    test(`posisjonen er synlig ved siden av filter og kort (${viewport.width} px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const kort = await apneNaerMeg(page);
      await page.waitForTimeout(1500); // fitBounds-animasjonen
      if (skjermbilder) await page.screenshot({ path: `${skjermbilder}/bredde-${viewport.width}.png` });
      const meg = (await page.locator(".kart-meg").boundingBox())!;
      const filter = (await page.locator("#kart-filter").boundingBox())!;
      const kortBoks = (await kort.boundingBox())!;
      const midt = { x: meg.x + meg.width / 2, y: meg.y + meg.height / 2 };
      const inni = (b: { x: number; y: number; width: number; height: number }) =>
        midt.x >= b.x && midt.x <= b.x + b.width && midt.y >= b.y && midt.y <= b.y + b.height;
      expect(inni(filter)).toBe(false);
      expect(inni(kortBoks)).toBe(false);
      expect(midt.x).toBeGreaterThan(0);
      expect(midt.y).toBeLessThan(viewport.height);
    });
  }

  test("passer på mobil uten å dekke søket", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const kort = await apneNaerMeg(page);
    if (skjermbilder) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${skjermbilder}/mobil.png` });
    }
    const kortBoks = (await kort.boundingBox())!;
    const sokBoks = (await page.getByRole("combobox").first().boundingBox())!;
    expect(kortBoks.y).toBeGreaterThan(sokBoks.y + sokBoks.height);
    expect(kortBoks.x + kortBoks.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: "📍 Nær meg" })).toBeHidden();
  });
});
