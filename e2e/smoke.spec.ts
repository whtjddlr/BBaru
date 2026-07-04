import { expect, test } from "@playwright/test";

test("keyless environment falls back to demo route", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("출발지").fill("강남역");
  await page.getByLabel("도착지").fill("선릉역");
  await page.getByRole("button", { name: "경로 검색" }).click();

  await expect(page).toHaveURL(/\/route$/);
  // 키 없는 CI에서는 예상 경로 배지, 키+쿼터가 살아있는 로컬에서는 실데이터 요약이 뜬다
  await expect(page.getByText("예상 경로").or(page.getByText("총 소요")).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "안내 시작" })).toBeVisible();

  await page.getByRole("button", { name: "안내 시작" }).click();

  await expect(page).toHaveURL(/\/en-route$/);
  await expect(page.getByText(/실시간 추적|데모 시뮬레이션|예상 안내|경로 안내/).first()).toBeVisible();
});

test("live geolocation projection updates route progress", async ({ browserName, context, page }) => {
  test.skip(!process.env.TMAP_APP_KEY, "TMAP_APP_KEY is required for live Tmap route geometry.");
  test.skip(browserName !== "chromium", "Geolocation mocking is validated in Chromium.");

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.497952, longitude: 127.027619 });

  await page.goto("/");
  await page.getByLabel("출발지").fill("강남역");
  await page.getByLabel("도착지").fill("선릉역");
  await page.getByRole("button", { name: "경로 검색" }).click();

  await expect(page).toHaveURL(/\/route$/);
  await expect(page.getByRole("button", { name: "안내 시작" })).toBeVisible({ timeout: 20000 });

  // Tmap 업스트림 장애(쿼터 초과 등)로 목업 폴백이 뜨면 실제 경로 투영을 검증할 수 없다
  await page.waitForTimeout(1000);
  test.skip(
    (await page.getByText("예상 경로").count()) > 0,
    "Tmap upstream unavailable — fell back to expected route, live projection untestable.",
  );

  await page.getByRole("button", { name: "안내 시작" }).click();

  await expect(page).toHaveURL(/\/en-route$/);
  await expect(page.getByText(/% 완료/).first()).toBeVisible();

  const initialProgress = await readProgressPercent(page);

  await context.setGeolocation({ latitude: 37.5045, longitude: 127.04896 });
  await expect.poll(() => readProgressPercent(page), { timeout: 8000 }).toBeGreaterThan(initialProgress + 20);
});

async function readProgressPercent(page: import("@playwright/test").Page): Promise<number> {
  const progressText = await page.getByText(/% 완료/).first().textContent();
  const progress = Number(progressText?.match(/(\d+)%/)?.[1] ?? "0");

  return progress;
}
