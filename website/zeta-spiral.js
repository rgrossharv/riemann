const canvas = document.getElementById('zeta-spiral');
const landing = document.getElementById('landing');
const themeRoot = document.documentElement;
const context = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const limit = 34;
const termCount = 72;
const logarithms = Array.from({ length: termCount }, (_, i) => Math.log(i + 1));

function zetaOnCriticalLine(t) {
  // Euler-transform the alternating eta series, then divide by 1 - 2^(1 - s).
  const real = logarithms.map(log => Math.exp(-log / 2) * Math.cos(t * log));
  const imaginary = logarithms.map(log => -Math.exp(-log / 2) * Math.sin(t * log));
  let etaReal = 0;
  let etaImaginary = 0;
  for (let length = termCount; length > 0; length--) {
    etaReal += real[0] / 2;
    etaImaginary += imaginary[0] / 2;
    for (let i = 0; i < length - 1; i++) {
      real[i] = (real[i] - real[i + 1]) / 2;
      imaginary[i] = (imaginary[i] - imaginary[i + 1]) / 2;
    }
  }
  const phase = t * Math.LN2;
  const divisorReal = 1 - Math.SQRT2 * Math.cos(phase);
  const divisorImaginary = Math.SQRT2 * Math.sin(phase);
  const norm = divisorReal ** 2 + divisorImaginary ** 2;
  return [
    (etaReal * divisorReal + etaImaginary * divisorImaginary) / norm,
    (etaImaginary * divisorReal - etaReal * divisorImaginary) / norm,
  ];
}

function sampleCurve() {
  const points = Array.from({ length: 751 }, (_, i) => zetaOnCriticalLine(i * limit / 750));
  const left = Math.min(...points.map(([x]) => x));
  const right = Math.max(...points.map(([x]) => x));
  const bottom = Math.min(...points.map(([, y]) => y));
  const top = Math.max(...points.map(([, y]) => y));
  return { points, left, right, bottom, top };
}

if (context) {
  let curve;
  let startedAt;
  let frame;

  function draw(now) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    curve ??= sampleCurve();
    startedAt ??= now;

    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const { points, left, right, bottom, top } = curve;
    const scale = Math.min(width * .86 / (right - left), height * .83 / (top - bottom));
    const centerX = width / 2 - (left + right) * scale / 2;
    const centerY = height / 2 + (bottom + top) * scale / 2;
    const light = themeRoot.classList.contains('light');

    context.lineWidth = 1;
    context.strokeStyle = light ? '#657d825a' : '#a3b0b631';
    context.setLineDash([2, 6]);
    context.beginPath();
    context.moveTo(.05 * width, centerY + .5);
    context.lineTo(.95 * width, centerY + .5);
    context.moveTo(centerX + .5, 0);
    context.lineTo(centerX + .5, height);
    context.stroke();
    context.setLineDash([]);

    const progress = reducedMotion.matches ? 1 : Math.min(1, (now - startedAt) / 1450);
    const visible = Math.floor((1 - (1 - progress) ** 2) * (points.length - 1));

    context.beginPath();
    context.moveTo(centerX + points[0][0] * scale, centerY);
    for (let i = 1; i <= visible; i++) {
      const [x, y] = points[i];
      context.lineTo(centerX + x * scale, centerY - y * scale);
    }
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 1.7;
    context.strokeStyle = light ? '#456469' : '#c4d5d5';
    context.stroke();

    if (progress < 1) frame = requestAnimationFrame(draw);
  }

  function scheduleDraw() {
    cancelAnimationFrame(frame);
    if (!landing.hidden) frame = requestAnimationFrame(draw);
  }

  function restart() {
    startedAt = undefined;
    scheduleDraw();
  }

  new ResizeObserver(scheduleDraw).observe(canvas);
  new MutationObserver(restart).observe(landing, {attributes: true, attributeFilter: ['hidden']});
  new MutationObserver(scheduleDraw).observe(themeRoot, {attributes: true, attributeFilter: ['class']});
  window.addEventListener('pageshow', event => {
    if (event.persisted && !landing.hidden) restart();
  });
  reducedMotion.addEventListener('change', scheduleDraw);
}
