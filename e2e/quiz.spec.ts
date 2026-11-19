import { test, expect } from "@playwright/test";

test.describe("Gjett smilefjeset", () => {
  test("dagens quiz kan spilles, deles og huskes etter ny lasting", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const feil: string[] = [];
    page.on("pageerror", (e) => feil.push(e.message));

    await page.goto("/quiz");
    await expect(page.getByRole("heading", { level: 1, name: "Gjett smilefjeset" })).toBeVisible();

    for (let i = 1; i <= 5; i++) {
      await expect(page.getByText(`Sted ${i} av 5`)).toBeVisible();
      await page.getByRole("button", { name: "Smil", exact: true }).click();
      await expect(page.getByRole("link", { name: /^Alle tilsyn hos/ })).toBeVisible();
      await page.getByRole("button", { name: i < 5 ? "Neste sted →" : "Se resultatet →" }).click();
    }

    const poeng = page.getByRole("heading", { level: 2, name: /^\d\/5$/ });
    await expect(poeng).toBeVisible();
    await expect(poeng).toBeFocused();
    const resultat = await poeng.textContent();

    await page.getByRole("button", { name: /Kopier resultatet/ }).click();
    await expect(page.getByRole("button", { name: /Kopiert!/ })).toBeVisible();
    const delt = await page.evaluate(() => navigator.clipboard.readText());
    expect(delt).toMatch(/^[😀😐😠]{5} \d\/5 på dagens Smilefjes-quiz! smilefjeskartet\.no\/quiz$/u);
    expect(delt).toContain(resultat!);

    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: resultat! })).toBeVisible();
    await expect(page.getByText("Neste quiz")).toBeVisible();
    expect(feil).toEqual([]);
  });

  test("øvingsrunde for en kommune", async ({ page }) => {
    await page.goto("/quiz");
    await page.getByRole("button", { name: "Øvingsrunde" }).click();
    await page.getByLabel("Fylke").selectOption("Vestland");
    await page.getByLabel("Kommune").selectOption({ label: "Bergen" });
    await page.getByRole("button", { name: /Start runde/ }).click();
    await expect(page.getByText("Øvingsrunde: Bergen")).toBeVisible();
    await expect(page.getByText("Sted 1 av 5")).toBeVisible();
    const tittel = page.locator("section:has-text('Sted 1 av 5') h2");
    await expect(tittel).toBeFocused();
    await expect(page.getByText(/Bergen$/).first()).toBeVisible();

    // Runden overlever bytte til dagens quiz og tilbake.
    const navn = await tittel.textContent();
    await page.getByRole("button", { name: "Dagens quiz" }).click();
    await page.getByRole("button", { name: "Øvingsrunde" }).click();
    await expect(tittel.filter({ visible: true })).toHaveText(navn!);
  });
});
