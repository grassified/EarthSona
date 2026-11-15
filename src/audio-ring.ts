export function mountAudioRing(canvas: HTMLCanvasElement, analyser: () => AnalyserNode | undefined, reduced: () => boolean, accent: () => string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { sync() {}, dispose() {} };
  const size = 340, center = size / 2, rays = 96;
  canvas.width = canvas.height = size;
  const values = new Uint8Array(512);
  const levels = new Float32Array(3);
  const bins = new Uint16Array(4);
  const frequencies = [85, 350, 1050, 5200];
  const cos = new Float32Array(rays), sin = new Float32Array(rays);
  for (let i = 0; i < rays; i++) {
    const angle = i * Math.PI * 2 / rays;
    cos[i] = Math.cos(angle);
    sin[i] = Math.sin(angle);
  }
  let frame = 0, last = -Infinity, visible = false, lit = false;
  let paintedAccent = '';
  let source: AnalyserNode | undefined;

  function draw(active: boolean, color: string) {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.globalAlpha = .38;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, 123, 0, Math.PI * 2);
    ctx.stroke();
    const gain = reduced() ? 11 : 29;
    const common = (levels[0] + levels[1] + levels[2]) / 3;
    for (let pass = 0; pass < (active ? 2 : 1); pass++) {
      ctx.strokeStyle = pass ? '#ed975c' : color;
      ctx.lineWidth = active ? 2 : 1;
      ctx.globalAlpha = active ? (pass ? .62 : .92) : .44;
      ctx.beginPath();
      for (let i = 0; i < rays; i++) {
        if (active && Number(i % 24 === 0) !== pass) continue;
        // Interleave the three bands so each part of the ring responds to the mix.
        const length = 2 + (active ? gain * (levels[i % 3] * .65 + common * .35) : 0);
        ctx.moveTo(center + cos[i] * 126, center + sin[i] * 126);
        ctx.lineTo(center + cos[i] * (126 + length), center + sin[i] * (126 + length));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    lit = active;
    paintedAccent = color;
  }

  function tick(now: number) {
    frame = 0;
    if (!visible || document.hidden || !source) return;
    if (now - last >= (reduced() ? 180 : 40)) {
      source.getByteFrequencyData(values);
      let active = false;
      for (let band = 0; band < 3; band++) {
        let peak = 0;
        for (let i = bins[band]; i < bins[band + 1]; i++) peak = Math.max(peak, values[i]);
        levels[band] = Math.max(0, (peak - 8) / 247);
        active ||= peak > 8;
      }
      if (active || lit || paintedAccent !== accent()) draw(active, accent());
      last = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    const next = visible && !document.hidden ? analyser() : undefined;
    if (next && next !== source) {
      frequencies.forEach((hz, i) => { bins[i] = Math.max(1, Math.round(hz * next.fftSize / next.context.sampleRate)); });
      last = -Infinity;
    }
    source = next;
    if (source) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      if (visible && !document.hidden && (lit || paintedAccent !== accent())) draw(false, accent());
    }
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  return {
    sync,
    dispose() {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(frame);
    },
  };
}
