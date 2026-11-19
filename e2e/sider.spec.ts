import { test, expect } from "@playwright/test";

test.describe("Sidevekt (#42)", () => {
  test("store kommunesider server-rendrer en kort liste og ett felles smilefjes-sprite", async ({ request }) => {
    const html = await (await request.get("/kommune/oslo")).text();
    // Før #42 var Oslo-siden 1,29 MB med 1 394 <svg>-er. Nå ~180 kB.
    expect(html.length).toBeLessThan(300_000);
    expect(html.match(/<svg/g)?.length ?? 0).toBeLessThan(150);
    expect(html.match(/<symbol id="smiley-/g)).toHaveLength(4);
    // Lenkene til de første stedene er fortsatt i HTML-en.
    expect(html.match(/href="\/sted\//g)?.length ?? 0).toBeGreaterThanOrEqual(48);
  });

  test("/analyse bruker spritet i stedet for innebygde fjes", async ({ request }) => {
    const html = await (await request.get("/analyse")).text();
    expect(html.length).toBeLessThan(950_000);
    expect(html.match(/<symbol id="smiley-/g)).toHaveLength(4);
    // Et innebygd fjes har alltid kinn-ellipsen; i spritet finnes den bare i «smil».
    expect(html.match(/<ellipse cx="15.5"/g)).toHaveLength(1);
  });

  test("Alle steder: søk og «vis flere» henter resten av stedene ved behov", async ({ page }) => {
    await page.goto("/kommune/oslo");
    const liste = page.locator("#steder ul a");
    await expect(liste).toHaveCount(48);
    const vent = page.waitForResponse((r) => r.url().endsWith("/kommune/oslo/steder.json") && r.ok());
    await page.getByRole("button", { name: /Vis flere/ }).click();
    await vent;
    await expect(liste).toHaveCount(48 + 150);

    await page.getByRole("searchbox", { name: /Søk blant/ }).fill("zzzz-finnes-ikke");
    await expect(page.getByText(/Ingen steder her matcher/)).toBeVisible();
    await page.getByRole("searchbox", { name: /Søk blant/ }).fill("pizza");
    await expect(liste.first()).toBeVisible();
    await expect(page.getByText(/\d+ treff/)).toBeVisible();
  });
});

test.describe("Mobil og forside (#44)", () => {
  test("headeren er én rad på mobil, og menyen kan rulles", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/om");
    const header = await page.locator("header").first().boundingBox();
    expect(header!.height).toBeLessThan(70);
    const meny = page.getByRole("navigation", { name: "Hovedmeny" }).locator("ul");
    const { scrollWidth, clientWidth, scrollLeft } = await meny.evaluate((ul) => ({
      scrollWidth: ul.scrollWidth,
      clientWidth: ul.clientWidth,
      scrollLeft: ul.scrollLeft,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    // «Om» er sist i menyen; den aktive lenken rulles fram.
    expect(scrollLeft).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: /Om/, exact: false }).and(page.locator('[aria-current="page"]'))).toBeInViewport();
  });

  test("forsiden har innhold og lenker i HTML-en før kartet er lastet", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    for (const href of ["/siste", "/kommune", "/varsling"]) expect(main).toContain(`href="${href}"`);
    expect(main).toContain("Teller smilefjes");
  });

  test("mørkt kart logger ikke at «circle-11» mangler", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const advarsler: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" || msg.type() === "error") advarsler.push(msg.text());
    });
    await page.goto("/");
    await expect(page.locator(".kart-klynge").first()).toBeVisible({ timeout: 15_000 });
    // By-prikkene tegnes ved lav zoom, som er startvisningen.
    await page.waitForTimeout(1500);
    expect(advarsler.filter((t) => t.includes("could not be loaded"))).toEqual([]);
  });
});
