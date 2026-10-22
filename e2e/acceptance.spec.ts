// End-to-end acceptance test: one full First Five in Practice Mode, driven the
// way a trainee would (typed transmissions taken from the Coach examples),
// plus the Test Mode secrecy check and a nothing-showing incident.
import { expect, type Page, test } from '@playwright/test';

// Seeds chosen so the "Residential" random pick is deterministic:
// 303 → beach house (working fire), 404 → odor investigation (nothing showing).
const WORKING_FIRE_SEED = '303';
const NOTHING_SHOWING_SEED = '404';

type Handle = { session: { getState: () => { sim: { conditionId: string; instance: { title: string; summary: string }; log: { kind: string; text: string }[]; ended?: { reason: string } } | null } } };
const engineState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __firstFive: Handle }).__firstFive.session.getState().sim!;
    const cond = s.conditionId;
    const problem = (s.instance as unknown as { conditionStates: { id: string; problem: string }[] }).conditionStates.find((c) => c.id === cond)?.problem;
    return { cond, problem, title: s.instance.title, summary: s.instance.summary, ended: s.ended?.reason ?? null, log: s.log.map((e) => `${e.kind}|${e.text}`) };
  });

async function startRandomResidential(page: Page, seed: string, mode: 'practice' | 'test') {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Residential' }).click();
  await page.getByLabel('Seed to reproduce an incident').fill(seed);
  await page.getByTestId(mode === 'practice' ? 'start-practice' : 'start-test').click();
}

async function send(page: Page, text: string) {
  await page.getByLabel('Transmission text').fill(text);
  await page.getByRole('button', { name: /^(Transmit|Say it)$/ }).click();
  const cont = page.getByTestId('continue');
  if (await cont.isVisible({ timeout: 1500 }).catch(() => false)) await cont.click();
}

async function coachExample(page: Page) {
  await page.getByRole('tab', { name: 'Coach' }).click();
  await page.getByRole('button', { name: 'Example' }).click();
  const text = await page.locator('text=One good way to say it').locator('xpath=following-sibling::p').innerText();
  await page.getByRole('button', { name: 'Example' }).click();
  return text;
}

const radioLog = (page: Page) => page.getByRole('log', { name: 'Radio log' });

test('First Five acceptance flow (Practice, random residential)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. Start a random residential incident.
  await startRandomResidential(page, WORKING_FIRE_SEED, 'practice');

  // 2. Dispatch: the card shows the nature and address, not the scenario name.
  const arriveBtn = page.getByTestId('arrive');
  await expect(arriveBtn).toBeVisible();
  const st0 = await engineState(page);
  await expect(page.getByText(st0.title)).toHaveCount(0);

  // 3. Arrive and observe the building.
  await arriveBtn.click();
  await expect(page.getByRole('tablist', { name: 'Building side' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  const arrivalCondition = (await engineState(page)).cond;

  // 4. Initial radio report.  5. Dispatch acknowledges it.
  await expect(page.getByTestId('current-task')).toContainText(/Initial/i);
  await send(page, await coachExample(page));
  await page.getByRole('tab', { name: 'Radio log' }).click();
  await expect(radioLog(page)).toContainText(/copies/i);

  let assigned = false;
  let walked = false;
  let followUp = false;
  let transfer = false;
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('view-review').isVisible().catch(() => false)) break;
    const task = (await page.getByTestId('current-task').innerText()).trim();
    if (/Walk the 360/.test(task) && !walked) {
      // 8. Walk the 360.
      await page.getByTestId('walk-360').click();
      walked = true;
      continue;
    }
    if (/Manage the Incident/.test(task)) {
      await page.getByRole('button', { name: /Next traffic/ }).click();
      continue;
    }
    if (/Command Transfer/.test(task)) {
      // 10. Battalion chief is on scene; 11. face-to-face transfer.
      await page.getByRole('tab', { name: 'Radio log' }).click();
      await expect(radioLog(page)).toContainText(/Battalion/);
      const f2f = page.getByLabel(/Face-to-face/);
      if (await f2f.isVisible().catch(() => false)) await f2f.check();
      transfer = true;
    }
    if (/Follow-up/i.test(task)) followUp = true;
    const example = await coachExample(page);
    // 6. Assign a unit when one is waiting.
    if (/, from .*Command/.test(example)) assigned = true;
    if (/Walk the 360/.test(task) && walked && !/, from /.test(example)) {
      await page.getByRole('button', { name: /Next traffic/ }).click();
      continue;
    }
    await send(page, example);
  }
  expect(walked).toBe(true);
  expect(assigned).toBe(true);
  expect(followUp).toBe(true); // 9. Follow-up report given.
  expect(transfer).toBe(true);

  // 7. Conditions evolved during the incident.
  const end = await engineState(page);
  expect(end.cond).not.toBe(arrivalCondition);
  expect(end.ended).toBe('transfer');
  await page.getByRole('tab', { name: 'Radio log' }).click();
  await expect(radioLog(page)).toContainText(/(copies|assuming)/i);

  // 12. Score and after-action review.
  await page.getByTestId('view-review').click();
  for (const label of ['Overall', 'Initial Radio Report', 'Follow-Up Report', 'Initial Actions & Assignments', 'Command Transfer']) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByText('Example of a concise preferred transmission').first()).toBeVisible();

  // 13. Replay transmissions.
  await page.getByRole('tab', { name: /Transcript/ }).click();
  const replay = page.getByRole('button', { name: /Replay this transmission|Play your recorded transmission/ }).first();
  await expect(replay).toBeVisible();
  await replay.click();

  // 14–15. New incident starts a fresh dispatch.
  await page.getByTestId('new-incident').click();
  await expect(page.getByTestId('arrive')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Test Mode shows no coaching, scores or scenario name before the review', async ({ page }) => {
  await startRandomResidential(page, WORKING_FIRE_SEED, 'test');
  const st = await engineState(page);
  await page.getByTestId('arrive').click();
  await expect(page.getByRole('tab', { name: 'Coach' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Example' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hint' })).toHaveCount(0);

  // An incomplete, partly wrong report: no feedback modal, no score badge.
  await send(page, 'Dispatch, Engine 14 on scene, large three-story commercial, nothing showing.');
  await expect(page.getByRole('dialog', { name: 'Transmission feedback' })).toHaveCount(0);
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain(st.title.toLowerCase());
  expect(body).not.toContain(st.summary.toLowerCase().slice(0, 40));
  expect(body).not.toMatch(/one good way to say it|incorrect|missing:|checklist/);
  await expect(radioLog(page).getByText(/^\d{1,3}$/)).toHaveCount(0);
});

test('Nothing-showing incident does not behave like a working fire', async ({ page }) => {
  await startRandomResidential(page, NOTHING_SHOWING_SEED, 'practice');
  await page.getByTestId('arrive').click();
  const st = await engineState(page);
  expect(st.problem).toBe('nothing-showing');
  const report = await coachExample(page);
  expect(report.toLowerCase()).toContain('nothing showing');
  await send(page, report);
  // Time passes with no fire developing on its own and no fire attack needed.
  await page.waitForTimeout(3000);
  const later = await engineState(page);
  expect(later.problem).toBe('nothing-showing');
  expect(later.log.some((l) => /working fire|fire showing|flames/i.test(l) && !l.startsWith('trainee'))).toBe(false);
});

test('Incomplete and incorrect reports are scored differently', async ({ page }) => {
  const grade = async (text: string) => {
    await startRandomResidential(page, WORKING_FIRE_SEED, 'practice');
    await page.getByTestId('arrive').click();
    await page.getByLabel('Transmission text').fill(text);
    await page.getByRole('button', { name: /^(Transmit|Say it)$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Transmission feedback' });
    await expect(dialog).toBeVisible();
    const t = await dialog.innerText();
    await page.getByTestId('continue').click();
    return t;
  };
  const incomplete = await grade('Dispatch, Engine 14 on scene.');
  const incorrect = await grade('Dispatch, Engine 14 on scene, large three-story commercial building, nothing showing, defensive.');
  expect(incomplete).toMatch(/missing/i);
  expect(incomplete).not.toMatch(/incorrect/i);
  expect(incorrect).toMatch(/incorrect/i);
});
