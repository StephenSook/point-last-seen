import { expect, test } from "@playwright/test";

test("a sighting can be placed and saved from the keyboard alone", async ({ page }) => {
  await page.goto("/harness/sighting.html");
  await page.getByLabel("Seen at").focus();
  const place = page.getByRole("combobox", { name: /^Place\b/ });
  // "Seen at" has its own stops (month, day, year, time); Tab on until Place, as a keyboard user would.
  for (let i = 0; i < 8 && !(await place.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(place).toBeFocused();
  await place.selectOption("AB");
  await expect(page.getByTestId("sighting-place")).toHaveText("Place: segment AB.");
  await page.getByRole("button", { name: "Save sighting" }).press("Enter");
  // AB is row A, column B of the synthetic grid: centre lon 0.003, lat -0.001
  const pos = JSON.parse(await page.getByTestId("saved").innerText()) as { lat: number; lon: number };
  expect(pos.lon).toBeCloseTo(0.003, 9);
  expect(pos.lat).toBeCloseTo(-0.001, 9);
});

test("a read that answers after the note changed is dropped, not filled into the fields", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  const note = page.getByRole("textbox", { name: "Note" });
  await note.fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await note.fill("blue coat by the gate");
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The note changed while it was being read. Read it again." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).not.toHaveValue("red");
  await expect(page.getByText("Suggested from the note. Check every field.")).toHaveCount(0);
});

test("a read of the unchanged note fills the fields", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
});

test("a cloud note read carries a closed What ran receipt with the bytes of the note sent", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=cloud");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Read in the cloud" }).click();
  // The web removes phone numbers by the shared rule (every shared case passes), so the consent says so plainly.
  await expect(page.getByText("The note goes to Gemini in the cloud. Phone numbers are removed first.")).toBeVisible();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  const receipt = page.getByRole("group").filter({ has: page.getByText("What ran", { exact: true }) });
  await receipt.getByText("What ran", { exact: true }).click();
  await expect(receipt).toContainText("Asked for: the cloud, after the consent tap.");
  await expect(receipt).toContainText("Ran: in the cloud (reported by the SDK).");
  await expect(receipt).toContainText("Sent: 22 bytes of the note, with phone numbers removed.");
});

test("a filled read shows the words it came from, quoted from the note", async ({ page }) => {
  await page.goto(`/harness/sighting.html?read=slow&quote=${encodeURIComponent("red jacket")}`);
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByText('From the note: "red jacket"', { exact: true })).toBeVisible();
});

test("a read with no quote shows no From the note line", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  await expect(page.getByText(/^From the note:/)).toHaveCount(0);
});

test("a quote that is not in the note is never shown", async ({ page }) => {
  await page.goto(`/harness/sighting.html?read=slow&quote=${encodeURIComponent("blue coat")}`);
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  await expect(page.getByText(/blue coat/)).toHaveCount(0);
});

test("saving after a cloud read hands that read's route to the sighting", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=cloud");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Read in the cloud" }).click();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  await page.getByRole("button", { name: "Save sighting" }).click();
  const read = JSON.parse(await page.getByTestId("saved-read").innerText()) as { route: { path: string; model: string; reason: string } };
  expect(read.route).toMatchObject({ path: "cloud", model: "gemini-3.5-flash-lite", reason: "consented_cloud_read" });
});

test("saving a sighting typed by hand hands no read, so it is recorded as hand entry", async ({ page }) => {
  await page.goto("/harness/sighting.html");
  await page.getByText("More details", { exact: true }).click();
  await page.getByRole("combobox", { name: "Top" }).selectOption("red");
  await page.getByRole("button", { name: "Save sighting" }).click();
  await expect(page.getByTestId("saved-read")).toHaveText("null");
});

test("saving after a read that reported no route hands the read with its route not reported", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  await page.getByRole("button", { name: "Save sighting" }).click();
  await expect(page.getByTestId("saved-read")).toHaveText('{"route":null}');
});

test("editing the note after a cloud read clears the read status and its receipt, and keeps the fields", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=cloud");
  const note = page.getByRole("textbox", { name: "Note" });
  await note.fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Read in the cloud" }).click();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  await expect(page.getByText("Suggested from the note. Check every field.")).toBeVisible();
  await expect(page.getByText("What ran", { exact: true })).toBeVisible();
  await note.fill("red jacket by the gate, then went left");
  await expect(page.getByText("Suggested from the note. Check every field.")).toHaveCount(0);
  await expect(page.getByText("What ran", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
});

test("editing the note after a read clears the words it came from, even when they are still in the note", async ({ page }) => {
  await page.goto(`/harness/sighting.html?read=slow&quote=${encodeURIComponent("red jacket")}`);
  const note = page.getByRole("textbox", { name: "Note" });
  await note.fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByText('From the note: "red jacket"', { exact: true })).toBeVisible();
  await note.fill("red jacket by the gate, then went left");
  await expect(page.getByText(/^From the note:/)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
});

test("editing the note after a read still saves that read's route, since the fields came from it", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=cloud");
  const note = page.getByRole("textbox", { name: "Note" });
  await note.fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Read in the cloud" }).click();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  await note.fill("red jacket by the gate, then went left");
  await page.getByRole("button", { name: "Save sighting" }).click();
  const read = JSON.parse(await page.getByTestId("saved-read").innerText()) as { route: { path: string } };
  expect(read.route.path).toBe("cloud");
});

test("a read that takes too long says so and leaves the fields to be filled by hand", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=timeout");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The read took too long. Fill the fields by hand." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("unknown");
});

test("Save works while a read is running, and a reply that lands after Save fills nothing", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  const save = page.getByRole("button", { name: "Save sighting" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId("saved")).toHaveText("null");
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("unknown");
  await expect(page.getByText("Suggested from the note. Check every field.")).toHaveCount(0);
});

test("a note that does not look like English is not sent to the cloud, and the form says so", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=cloud&lang=other");
  await page.getByRole("textbox", { name: "Note" }).fill("Бабушка ушла к реке");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Read in the cloud" }).click();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "This note doesn't look like English, so it isn't sent to the cloud to be read. Fill the fields by hand." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("unknown");
});

test("a read keeps a field changed by hand, says so, and fills the rest", async ({ page }) => {
  await page.goto(`/harness/sighting.html?read=slow&quote=${encodeURIComponent("red jacket")}`);
  // The person sets Top by hand first; the model will answer red.
  await page.getByText("More details", { exact: true }).click();
  await page.getByRole("combobox", { name: "Top" }).selectOption("green");
  await page.getByRole("textbox", { name: "Footwear" }).fill("boots");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("green");
  await expect(page.getByRole("textbox", { name: "Footwear", includeHidden: true })).toHaveValue("boots");
  await expect(page.getByText("Suggested from the note. Check every field. Your edits were kept.")).toBeVisible();
});

test("a read with no field changed by hand fills every field and says nothing about edits", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
  await expect(page.getByText("Suggested from the note. Check every field.", { exact: true })).toBeVisible();
});

test("with cloud reading paused by command, the form says so and offers no cloud read", async ({ page }) => {
  await page.goto("/harness/sighting.html?paused=1");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await expect(page.getByText("Cloud reading is paused by command.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Read in the cloud" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I consent for this note" })).toHaveCount(0);
});

test("a cloud read refused because command paused cloud reading says so and offers no cloud read", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=cloud&paused=late");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await page.getByRole("button", { name: "Read in the cloud" }).click();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cloud reading is paused by command. Fill the fields by hand." })).toBeVisible();
  await expect(page.getByRole("button", { name: "I consent for this note" })).toHaveCount(0);
  await expect(page.getByText("The note could not be read.")).toHaveCount(0);
});

test("the form shows when, where, the note and Save first; the other fields wait under More details", async ({ page }) => {
  await page.goto("/harness/sighting.html");
  const form = page.getByRole("form", { name: "Add sighting" });
  for (const name of ["Seen at", "Note"]) await expect(form.getByLabel(name, { exact: true })).toBeVisible();
  await expect(form.getByRole("combobox", { name: /^Place\b/ })).toBeVisible();
  for (const name of ["Going", "Top", "Bottom", "Reported by"]) await expect(form.getByRole("combobox", { name })).toBeHidden();
  for (const name of ["Footwear", "Carrying"]) await expect(form.getByRole("textbox", { name })).toBeHidden();
  const save = form.getByRole("button", { name: "Save sighting" });
  await expect(save).toBeVisible();
  const gap = await form.evaluate((f) => f.querySelector("button[type=submit]")!.getBoundingClientRect().top - f.getBoundingClientRect().top);
  expect(gap).toBeLessThan(560);
  await page.getByText("More details", { exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Going" })).toBeVisible();
});

test("a read that fills the fields opens More details, so every filled field is in view to check", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toBeHidden();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByText("Suggested from the note. Check every field.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Top" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Top", includeHidden: true })).toHaveValue("red");
});

test("while the note is read on this laptop, the form says so and that the first read can take up to a minute", async ({ page }) => {
  await page.goto("/harness/sighting.html?read=slow");
  await page.getByRole("textbox", { name: "Note" }).fill("red jacket by the gate");
  await page.getByRole("button", { name: "Read the note" }).click();
  const waiting = page.getByRole("status").filter({ hasText: "Reading the note on this laptop" });
  await expect(waiting).toHaveText("Reading the note on this laptop. The first read can take up to a minute.");
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(waiting).toHaveCount(0);
});
