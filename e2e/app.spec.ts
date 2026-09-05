import { expect, test } from "@playwright/test"

test("app loads with the demo label and a reachable nav at desktop and narrow widths", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Demo: automated rules, simulated payments")).toBeVisible()
  await expect(page.getByRole("button", { name: "Marketplace" })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole("button", { name: "Marketplace" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Wallet" })).toBeVisible()
})

test("seller rejects an out-of-range listing and publishes a valid one", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Sell" }).click()

  await page.getByPlaceholder("e.g. 350").fill("200")
  await page.getByRole("button", { name: "Publish listing" }).click()
  await expect(page.getByText(/below the accepted range/)).toBeVisible()

  await page.getByPlaceholder("e.g. 350").fill("350")
  await page.getByRole("button", { name: "Publish listing" }).click()
  await expect(page.getByText("Listing published (auto-approved).")).toBeVisible()

  await page.getByRole("button", { name: "Activity" }).click()
  await page.getByRole("tab", { name: "Seller listings" }).click()
  await expect(page.getByText("Rejected").first()).toBeVisible()
  await expect(page.getByText("Live").first()).toBeVisible()
})

test("buyer reserves then authorizes a simulated payment", async ({ page }) => {
  await page.goto("/")
  await page.locator(".persona select").selectOption("buyer-alex")

  // Add the seeded (affordable) microwave listing to the cart and submit an intent.
  const card = page.locator(".listing", { hasText: "Panasonic" })
  await card.getByRole("button", { name: "I want this" }).click()
  await page.locator(".persona-nav button", { hasText: "Cart" }).click()
  await page.getByRole("button", { name: /Review & price offers/ }).click()
  await page.getByRole("button", { name: "Submit intent for Guardian review" }).click()

  // Authorization gate: a proposal is now awaiting authorization.
  await page.locator(".demo-nav button", { hasText: "Authorize" }).click()
  await expect(page.getByText("Awaiting authorization").first()).toBeVisible()
  await page.getByRole("button", { name: /Authorize Demo SGD/ }).click()

  // After authorizing, no proposal remains awaiting authorization.
  await expect(page.getByText("No payments are awaiting your authorization.")).toBeVisible()
})
