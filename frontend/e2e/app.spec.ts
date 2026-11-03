import { expect, test, type Page } from "@playwright/test";
import path from "path";

const pages = [
  { path: "/", heading: /AI-Driven Skin Disease/ },
  { path: "/skin", heading: "Skin Disease Classification" },
  { path: "/amr", heading: "Antimicrobial Resistance Prediction" },
  { path: "/research", heading: /Two models/ },
  { path: "/how", heading: /How It/ },
  { path: "/about", heading: /Built for learning/ },
];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${m.location().url}`));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const p of pages) {
  test(`page ${p.path} renders without errors or overflow`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(p.heading);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("navigation buttons reach every page", async ({ page }) => {
  await page.goto("/");
  for (const [name, url] of [["Skin Classification", "/skin"], ["AMR Prediction", "/amr"], ["Research", "/research"],
                             ["How It Works", "/how"], ["About", "/about"], ["Home", "/"]]) {
    await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${url === "/" ? "/$" : url}$`));
    await expect(page.getByRole("navigation").getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("AMR form returns the model output", async ({ page }) => {
  await page.goto("/amr");
  await page.getByLabel("Case Year").fill("2024");
  await page.getByLabel("Sex").selectOption("F");
  await page.getByLabel("Age Group").selectOption("19-35");
  await page.getByLabel("On Antibiotics (Abx)").selectOption("Yes");
  await page.getByRole("button", { name: /Run AMR Model/ }).click();
  const out = page.locator(".amr-output");
  await expect(out).toContainText("Predicted Class");
  await expect(out).toContainText("MDR");
  await expect(out).toContainText("79.82%");
  await expect(out).toContainText("Exploratory scores");
});

test("AMR shows the backend error for an out-of-range year", async ({ page }) => {
  await page.goto("/amr");
  await page.getByLabel("Case Year").fill("1800");
  // bypass the browser's own min/max check so the backend validation is exercised
  await page.locator("form.amr-form").evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await page.getByRole("button", { name: /Run AMR Model/ }).click();
  await expect(page.locator("p.error[role=alert]")).toContainText("1900 to 2100");
});

test("skin upload shows preview, scores and notice", async ({ page }) => {
  await page.goto("/skin");
  const classify = page.getByRole("button", { name: /Classify Image/ });
  await expect(classify).toBeDisabled();
  await page.getByLabel("Choose skin image").setInputFiles(path.join(__dirname, "../public/lesion.png"));
  await expect(page.getByAltText("Selected skin image")).toBeVisible();
  await classify.click();
  const result = page.locator(".result-card");
  await expect(result).toContainText("Predicted Class");
  await expect(result.locator(".score")).toHaveCount(7);
  await expect(result).toContainText("not a clinical diagnosis");
});

test("skin upload rejects a non-image file in the browser", async ({ page }) => {
  await page.goto("/skin");
  await page.getByLabel("Choose skin image").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.locator("p.error[role=alert]")).toContainText("JPG, PNG, or WebP");
});

test("remove button clears the selected image", async ({ page }) => {
  await page.goto("/skin");
  await page.getByLabel("Choose skin image").setInputFiles(path.join(__dirname, "../public/lesion.png"));
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByAltText("Selected skin image")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Classify Image/ })).toBeDisabled();
});
