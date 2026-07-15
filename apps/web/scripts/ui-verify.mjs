import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../screenshots/ui-verify-headers");
const BASE = "http://localhost:3200";
const EMAIL = "uitest@castify.dev";
const PASS = "TestPass123!";

const PAGES = [
  { name: "00-overview", path: "/dashboard" },
  { name: "01-streams", path: "/dashboard/streams" },
  { name: "02-new-broadcast", path: "/dashboard/streams/new" },
  { name: "03-analytics", path: "/dashboard/analytics" },
  { name: "04-recordings", path: "/dashboard/recordings" },
  { name: "05-stream-keys", path: "/dashboard/stream-keys" },
  { name: "06-crm", path: "/dashboard/crm" },
  { name: "07-profile", path: "/dashboard/profile" },
  { name: "08-settings", path: "/dashboard/settings" },
  { name: "09-billing", path: "/dashboard/billing" },
  { name: "10-landing", path: "/" },
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASS);
  await page.click("#login-submit-btn");
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  await page.waitForTimeout(800);
}

async function shoot(page, name, viewport) {
  const file = path.join(OUT, `${viewport}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
}

async function runViewport(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  try {
    await login(page);
  } catch (e) {
    console.error("login failed", e.message);
    await page.screenshot({ path: path.join(OUT, `${label}-login-fail.png`) });
    await context.close();
    throw e;
  }

  for (const p of PAGES) {
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(600);
      await shoot(page, p.name, label);
    } catch (e) {
      console.error("fail", p.name, e.message);
      await page.screenshot({ path: path.join(OUT, `${label}-${p.name}-err.png`) });
    }
  }

  await context.close();
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, { width: 1440, height: 900 }, "desktop");
  await runViewport(browser, { width: 390, height: 844 }, "mobile");
} finally {
  await browser.close();
}
console.log("done");
