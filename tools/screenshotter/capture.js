const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const APP_URL = "http://127.0.0.1:5173";
const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "diploma_output", "screenshots");
const EXECUTABLE_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

const accounts = {
  admin: {
    email: "admin@acme.test",
    password: "Admin12345!",
    companyDomain: "acme-demo"
  },
  employee: {
    email: "employee@acme.test",
    password: "Employee12345!",
    companyDomain: "acme-demo"
  }
};

function getExecutablePath() {
  const executablePath = EXECUTABLE_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error("Chrome/Edge executable not found.");
  }
  return executablePath;
}

async function login(page, credentials) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').waitFor({ timeout: 15000 });
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.locator('input[name="companyDomain"]').fill(credentials.companyDomain);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 20000 }),
    page.locator('button[type="submit"]').click()
  ]);
  await page.locator("main").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
}

async function navigateToRoute(page, relativeUrl) {
  await page.evaluate((route) => {
    window.history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, relativeUrl);
  await page.waitForTimeout(1200);
}

async function capture(page, relativeUrl, filename, waitSelector) {
  await navigateToRoute(page, relativeUrl);
  if (waitSelector) {
    await page.locator(waitSelector).first().waitFor({ timeout: 15000 });
  }
  await page.screenshot({
    path: path.join(OUTPUT_DIR, filename),
    fullPage: true
  });
}

async function captureEmployeeCourse(page) {
  await navigateToRoute(page, "/courses");
  await page.locator("a[href^='/courses/']").first().waitFor({ timeout: 15000 });
  const courseLinks = await page.locator("a[href^='/courses/']").evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("href"))
      .filter((href) => href && /^\/courses\/\d+$/.test(href))
  );
  const firstCourse = courseLinks[0];
  if (!firstCourse) {
    throw new Error("No employee course link found.");
  }
  await navigateToRoute(page, firstCourse);
  await page.locator("main, h1, h2").first().waitFor({ timeout: 15000 });
  await page.screenshot({
    path: path.join(OUTPUT_DIR, "06-course-viewer.png"),
    fullPage: true
  });
}

async function logout(page) {
  const button = page.locator("button", { hasText: "Выйти" });
  if ((await button.count()) > 0) {
    await Promise.all([
      page.waitForURL("**/login", { timeout: 20000 }),
      button.click()
    ]);
    await page.locator("form").waitFor({ timeout: 15000 });
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: getExecutablePath(),
    headless: true,
    args: ["--no-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    locale: "ru-RU",
    colorScheme: "light"
  });
  const page = await context.newPage();

  console.log("capture: login page");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator("form").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, "01-login.png"),
    fullPage: true
  });
  console.log("capture: admin login");
  await login(page, accounts.admin);
  console.log("capture: admin pages");
  await capture(page, "/dashboard", "02-dashboard.png", "main");
  await capture(page, "/users", "03-users.png", "main");
  await capture(page, "/chat", "04-chat.png", "main");
  await capture(page, "/roles", "05-roles.png", "main");
  await logout(page);

  console.log("capture: employee login");
  await login(page, accounts.employee);
  console.log("capture: employee pages");
  await capture(page, "/courses", "07-courses.png", "main");
  await captureEmployeeCourse(page);
  await capture(page, "/certificates", "08-certificates.png", "main");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
