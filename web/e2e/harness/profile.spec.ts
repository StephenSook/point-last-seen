import { expect, test } from "@playwright/test";

test("saving the profile closes the form at once, even while the server has not answered", async ({ page }) => {
  await page.goto("/harness/profile.html");
  await page.getByLabel("Answers to").fill("Bea");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("closed")).toHaveText("Form closed after 1 save.", { timeout: 500 });
});

test("with the family's list of names, the form shows the list and offers no single nickname to edit", async ({ page }) => {
  await page.goto("/harness/profile.html?names=1");
  await expect(page.getByLabel("Nickname")).toHaveCount(0);
  await expect(page.getByText("Names they answer to: Bea, Mom, Roberta. The family keeps this list in their app.")).toBeVisible();
});

test("without a list, the nickname is still edited here", async ({ page }) => {
  await page.goto("/harness/profile.html");
  await expect(page.getByLabel("Nickname")).toBeVisible();
});

test.describe("tracking and ID aids", () => {
  test("left unanswered, a save sends no tracking aids at all", async ({ page }) => {
    await page.goto("/harness/profile.html");
    const group = page.getByRole("group", { name: "Tracking or ID aids" });
    await expect(group.getByRole("radio", { name: "Not known yet" })).toBeChecked();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByTestId("saved-aids")).toHaveText("absent");
  });

  test("the aids the family named are saved in card order, with the note", async ({ page }) => {
    await page.goto("/harness/profile.html");
    const group = page.getByRole("group", { name: "Tracking or ID aids" });
    await group.getByRole("radio", { name: "The family answered" }).check();
    await group.getByRole("checkbox", { name: "Carries a GPS tracker" }).check();
    await group.getByRole("checkbox", { name: "Enrolled in Project Lifesaver" }).check();
    await group.getByRole("textbox", { name: "Note for teams (no numbers)" }).fill("In his coat pocket");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByTestId("saved-aids")).toHaveText('{"aids":["project_lifesaver","gps_tracker"],"note":"In his coat pocket"}');
  });

  test("answered with nothing ticked means none", async ({ page }) => {
    await page.goto("/harness/profile.html");
    await page.getByRole("group", { name: "Tracking or ID aids" }).getByRole("radio", { name: "The family answered" }).check();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByTestId("saved-aids")).toHaveText('{"aids":[],"note":""}');
  });

  test("a note with a number is refused, and nothing is saved", async ({ page }) => {
    await page.goto("/harness/profile.html");
    const group = page.getByRole("group", { name: "Tracking or ID aids" });
    await group.getByRole("radio", { name: "The family answered" }).check();
    await group.getByRole("textbox", { name: "Note for teams (no numbers)" }).fill("Serial 4471");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("alert")).toHaveText("Leave out numbers: give serials and phone numbers to the search lead directly.");
    await expect(page.getByTestId("closed")).toHaveCount(0);
  });

  test("aids already named show as ticked", async ({ page }) => {
    await page.goto("/harness/profile.html?aids=medicalert_id");
    const group = page.getByRole("group", { name: "Tracking or ID aids" });
    await expect(group.getByRole("radio", { name: "The family answered" })).toBeChecked();
    await expect(group.getByRole("checkbox", { name: "Wears a MedicAlert ID" })).toBeChecked();
  });
});
