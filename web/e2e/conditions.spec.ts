import { deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// Command types the incident's conditions on the test drill; the phones read them for the urgency chip.
test("command saves the incident's conditions and sees the chip the phones show", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await joinCommand(page);
  const form = page.getByRole("region", { name: "Conditions" });
  const temp = form.getByLabel("Air temperature (°F)");
  await expect(temp).toBeVisible({ timeout: 20_000 });
  // A value different from what is there, so the saved line can only be this write's.
  const next = (await temp.inputValue()) === "38" ? "39" : "38";
  await temp.fill(next);
  await form.getByRole("radio", { name: "No", exact: true }).check();
  await form.getByRole("button", { name: "Save conditions" }).click();
  // updateDoc settles only once the server has the write: the button comes back from "Saving" then.
  await expect(form.getByRole("button", { name: "Save conditions" })).toBeEnabled({ timeout: 20_000 });
  await expect(form.getByRole("alert")).toHaveCount(0);
  await expect(form.getByTestId("conditions-set")).toContainText(`${next} °F, wet: no`);
  await expect(form.getByTestId("urgency-chip")).toHaveText("Cold raises urgency");
});
