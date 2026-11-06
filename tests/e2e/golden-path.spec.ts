import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, userId: string) {
  const res = await page.request.post("/api/auth/login", { data: { userId } });
  expect(res.ok()).toBeTruthy();
}

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("golden path: intake → NO_FIT → approved $49 proof → fixture payment → FAIL → PASS → CONDITIONAL_FIT replay", async ({ page }) => {
  // Clean, fictional starting point.
  await signInAs(page, "usr_maya");
  expect((await page.request.post("/api/demo/reset", { data: { mode: "clean" } })).ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Buy proof.");
  await expectNoSeriousA11yViolations(page);

  // Buyer signs in through the persona picker and submits the demo scenario.
  await page.goto("/login");
  await page.getByTestId("persona-usr_maya").click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("link", { name: "New Assessment", exact: true }).click();
  // Plain-language intake: the (offline, labelled) extractor drafts the form from the buyer's words.
  await page.getByTestId("use-sample-text").click();
  await page.getByTestId("draft-with-ai").click();
  await expect(page.getByTestId("draft-result")).toContainText("Offline keyword extractor");
  await expect(page.locator("#ver-hubspot")).toHaveValue("v3");
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("submit-request").click();
  await expect(page).toHaveURL(/\/requests\/req_/);
  await expect(page.getByRole("heading", { name: "Not a fit, as requested" })).toBeVisible();
  await expect(page.getByText("R-CRM-WRITE-SCOPE").first()).toBeVisible();
  await expect(page.locator("#main").getByText("Offline evaluator", { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  const requestUrl = page.url();
  await page.getByTestId("open-contract").click();
  await expect(page).toHaveURL(/\/contracts\/pc_/);
  const contractUrl = page.url();
  // The proof brief (offline template here) pins each question to a check the simulator runs.
  await expect(page.getByText("What this test answers")).toBeVisible();
  await expect(page.getByText("S4 · Human approval gate").first()).toBeVisible();

  // Seller approves the immutable scope and price.
  await signInAs(page, "usr_ravi");
  await page.goto(contractUrl);
  await page.getByTestId("approve-contract").click();
  const approvals = page.locator("section", { has: page.getByRole("heading", { name: "Who approved what" }) });
  await expect(approvals.getByText(/^Ravi Okafor · /)).toBeVisible();

  // Buyer accepts the exact version and pays through the labelled FIXTURE provider.
  await signInAs(page, "usr_maya");
  await page.goto(contractUrl);
  await page.getByTestId("accept-ack").check();
  await page.getByTestId("accept-contract").click();
  await page.getByTestId("fixture-checkout").click();
  await expect(page).toHaveURL(/\/checkout\/fixture\/FIXTURE-/);
  await expect(page.getByText("Simulated checkout — not PayPal")).toBeVisible();
  await page.getByTestId("fixture-approve").click();
  await expect(page).toHaveURL(contractUrl);
  await expect(page.getByText("Proof queued", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Simulated — not PayPal").first()).toBeVisible();

  // Seller runs test #1 (fails), records the environment change, runs test #2 (passes).
  await signInAs(page, "usr_ravi");
  await page.goto(contractUrl);
  await page.getByTestId("execute-run-1").click();
  await expect(page.getByText("INSUFFICIENT_PERMISSION").first()).toBeVisible();
  await page.getByTestId("queue-retest").click();
  await page.getByTestId("execute-run-2").click();
  await expect(page.getByText("Proof passed", { exact: true }).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Outcome memory shows both, and decision replay changes the recommendation.
  await page.goto("/outcomes");
  const cards = page.locator("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.getByText("INSUFFICIENT_PERMISSION").first()).toBeVisible();
  await expect(cards.getByText("Passed", { exact: true }).first()).toBeVisible();
  const requestId = requestUrl.split("/").pop()!;
  await page.goto(`/replay?requestId=${requestId}`);
  await expect(page.getByText(/the blockers? became (a )?conditions?/)).toBeVisible();
  await expect(page.getByText("Conditional fit", { exact: true }).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // The passing run already re-assessed the request: its saved verdict is the new one, with no click needed.
  await page.goto(requestUrl);
  await expect(page.getByRole("heading", { name: "A fit, on verified conditions" })).toBeVisible();
  await expect(page.getByText("Fit re-assessed with the passing proof").first()).toBeAttached();
});

test("a second buyer cannot open another tenant's request", async ({ page }) => {
  await signInAs(page, "usr_maya");
  const created = await page.request.post("/api/requests", {
    data: {
      sellerOrganizationId: "org_lumen",
      title: "Isolation check request",
      goal: "Read HubSpot contacts into a weekly spreadsheet report for operations.",
      budgetMinor: 100000,
      currency: "USD",
      timelineDays: 30,
      tools: [{ key: "hubspot", apiVersion: "v3", permissionsStatus: "stated", grantedPermissions: ["contacts.read"] }],
      operations: ["crm_read"],
      compliance: { dataResidency: "none", approvalMode: "human_in_loop", containsPii: false },
      notes: "",
    },
  });
  expect(created.status()).toBe(201);
  const { requestId } = await created.json();
  await signInAs(page, "usr_iris");
  const res = await page.goto(`/requests/${requestId}`);
  expect(res?.status()).toBe(404);
  const api = await page.request.post(`/api/assess`, { data: { requestId } });
  expect(api.status()).toBe(404);
});
