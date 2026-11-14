export function mountAudioRing(canvas: HTMLCanvasElement, analyser: () => AnalyserNode | undefined, reduced: () => boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const values = new Uint8Array(128);
  const size = 340;
  canvas.width = canvas.height = size;
  const center = size / 2;
  let frame = 0;
  let last = -Infinity;
  let visible = false;
  let lit = false;

  function tick(now: number) {
    frame = 0;
    if (!visible || document.hidden) return;
    if (now - last >= (reduced() ? 200 : 40)) {
      values.fill(0);
      analyser()?.getByteFrequencyData(values);
      const active = values.some(value => value > 5);
      if (active || lit || last === -Infinity) {
        ctx!.clearRect(0, 0, size, size);
        ctx!.strokeStyle = active ? '#6ccbd8' : '#354b54';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(center, center, 123, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.lineWidth = 2;
        for (let i = 0; i < 96; i++) {
          const angle = i / 96 * Math.PI * 2 - Math.PI / 2;
          const bin = Math.min(127, Math.floor(2 ** (Math.min(i, 95 - i) / 47 * 7)));
          const length = 2 + (active ? values[bin] / 255 * (reduced() ? 12 : 34) : 0);
          ctx!.beginPath();
          ctx!.moveTo(center + Math.cos(angle) * 126, center + Math.sin(angle) * 126);
          ctx!.lineTo(center + Math.cos(angle) * (126 + length), center + Math.sin(angle) * (126 + length));
          ctx!.stroke();
        }
        lit = active;
      }
      last = now;
    }
    frame = requestAnimationFrame(tick);
  }

  const wake = () => {
    if (visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', wake);
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', wake);
    cancelAnimationFrame(frame);
  };
}
