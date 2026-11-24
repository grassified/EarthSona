// Run with playwright-cli run-code --filename=tests/deployment-parity.browser.js.
async page => {
  const url = page.url();
  const origin = new URL(url).origin;
  const browser = page.context().browser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const errors = [];
  const responses = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  try {
    // A production build must load its imagery and exporter from the static server.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const player = await context.newPage();
    player.on('pageerror', error => errors.push(error.message));
    player.on('requestfailed', request => errors.push(`Failed request: ${request.url()}`));
    player.on('response', response => responses.push(response));
    await player.goto(url);
    await player.locator('[data-region="0"]:enabled').waitFor();

    const expected = [
      [320, 16, 254],
      [390, 16, 321],
      [720, 16, 624],
      [721, 11, 149],
    ];
    const measurements = [];
    for (const [width, helpFont, regionWidth] of expected) {
      await player.setViewportSize({ width, height: 844 });
      const result = await player.evaluate(() => {
        const region = document.querySelector('[data-region="0"]');
        const menu = document.querySelector('#open-menu').getBoundingClientRect();
        return {
          helpFont: parseFloat(getComputedStyle(document.querySelector('#globe-help')).fontSize),
          regionWidth: Math.round(region.getBoundingClientRect().width),
          menuWidth: menu.width,
          menuHeight: menu.height,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      assert(result.helpFont === helpFont, `${width}px: map help was ${result.helpFont}px, expected ${helpFont}px`);
      assert(Math.abs(result.regionWidth - regionWidth) <= 1,
        `${width}px: region button was ${result.regionWidth}px, expected ${regionWidth}px (±1)`);
      assert(result.menuWidth >= 44 && result.menuHeight >= 44 && result.scrollWidth === width,
        `${width}px: navigation target size or page width changed`);
      measurements.push({ width, ...result });
    }

    await player.setViewportSize({ width: 390, height: 844 });
    await player.locator('#open-menu').click();
    const drawer = player.locator('#drawer[open]');
    await drawer.waitFor();
    assert(await drawer.evaluate(element => getComputedStyle(element).overflowY) === 'auto',
      'The mobile navigation drawer must scroll');
    await drawer.locator('[data-close-menu]').click();
    await player.locator('[data-display="flat"]').click();
    await player.locator('#map').waitFor();
    await player.locator('[data-transport]').click();
    await player.locator('[data-transport][data-action="stop"]').waitFor();
    await player.keyboard.press('Escape');
    await player.locator('[data-transport][data-action="play"]').waitFor();

    await player.locator('[data-view="explore"]:visible').click();
    await player.locator('[data-dataset="gedi"]').click();
    await player.locator('[data-active-dataset="gedi"] [data-region="0"]:enabled').waitFor();
    assert(await player.locator('#globe').count() === 0, 'GEDI must remain a 2D dataset');
    await player.locator('[data-region="0"]').click();
    await player.locator('[data-add-studio]:enabled').click();
    await player.locator('#note-editor select[name="pitch"]').selectOption('60');
    await player.locator('#note-editor button[type="submit"]').click();
    assert((await player.locator('[data-step="0"]').getAttribute('aria-label')).includes('C4'),
      'The selected composition step did not update');

    const isExporter = response => /\/studio-export-[^/]+\.js$/.test(new URL(response.url()).pathname);
    assert(!responses.some(isExporter), 'The Studio exporter is expected to load on demand');
    const [download] = await Promise.all([
      player.waitForEvent('download'),
      player.locator('[data-export]').click(),
    ]);
    assert(download.suggestedFilename() === 'EarthSona.wav' && await download.failure() === null,
      'Studio did not finish the WAV download');
    const exporter = responses.find(isExporter);
    assert(exporter?.ok() && exporter.headers()['content-type']?.includes('javascript'),
      'The static server did not serve the lazy exporter as JavaScript');
    assert(responses.every(response => response.ok()) && errors.length === 0,
      `Production asset or browser errors: ${errors.concat(responses.filter(response => !response.ok())
        .map(response => `${response.status()} ${response.url()}`)).join(', ')}`);

    return { measurements, exporter: new URL(exporter.url()).pathname, download: download.suggestedFilename() };
  } finally {
    await context.close();
  }
}
