(() => {
  const canvas = document.getElementById('neural-scene');
  const ctx = canvas?.getContext('2d', { alpha: true });
  const toggle = document.getElementById('motion-toggle');
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  if (!canvas || !ctx) return;

  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0, height = 0, dpr = 1, frame = 0, paused = reducedMotion;
  let yaw = -0.32, pitch = -0.08, targetYaw = yaw, targetPitch = pitch;
  let dragging = false, lastX = 0, lastY = 0, elapsed = 0;

  const nodes = [];
  const nodeCount = 44;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nodeCount; i++) {
    const y = 1 - (i / (nodeCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const angle = golden * i;
    nodes.push({ x: Math.cos(angle) * radius * 1.02, y: y * 1.02, z: Math.sin(angle) * radius * 1.02, i });
  }
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    const nearest = nodes.map((n, j) => ({ j, d: Math.hypot(nodes[i].x - n.x, nodes[i].y - n.y, nodes[i].z - n.z) }))
      .filter(v => v.j !== i).sort((a, b) => a.d - b.d).slice(0, 3);
    for (const near of nearest) if (i < near.j && near.d < .78) edges.push([i, near.j]);
  }
  const stars = Array.from({ length: 70 }, (_, i) => ({
    x: ((i * 97 + 31) % 997) / 997,
    y: ((i * 173 + 17) % 991) / 991,
    r: .45 + (i % 4) * .27,
    a: .12 + (i % 5) * .035,
  }));
  const particles = Array.from({ length: 48 }, (_, i) => ({
    t: (i / 48 + (i * .037)) % 1,
    speed: .16 + (i % 7) * .012,
    lane: (i % 5) - 2,
    warm: i % 6 === 0,
    size: 1 + (i % 3) * .45,
  }));

  function resize() {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function rotate(p) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x = p.x * cy - p.z * sy;
    const z = p.x * sy + p.z * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return { x, y: p.y * cp - z * sp, z: p.y * sp + z * cp };
  }

  function project(p) {
    const v = rotate(p);
    const k = 3.65 / Math.max(2.25, 3.65 - v.z);
    const scale = Math.min(width, height) * .32;
    return { x: width * .51 + v.x * scale * k, y: height * .53 - v.y * scale * k, z: v.z };
  }

  function glow(color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
  function clearGlow() { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(91,170,192,.045)';
    ctx.lineWidth = 1;
    const step = 30;
    for (let x = width * .07; x < width * .94; x += step) {
      ctx.beginPath(); ctx.moveTo(x, height * .12); ctx.lineTo(x, height * .88); ctx.stroke();
    }
    for (let y = height * .14; y < height * .9; y += step) {
      ctx.beginPath(); ctx.moveTo(width * .07, y); ctx.lineTo(width * .94, y); ctx.stroke();
    }
    for (const s of stars) {
      ctx.fillStyle = `rgba(140,210,226,${s.a})`;
      ctx.beginPath(); ctx.arc(s.x * width, s.y * height, s.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawRing(rx, rz, tilt, color, lineWidth, phase = 0) {
    ctx.beginPath();
    for (let i = 0; i <= 144; i++) {
      const a = (i / 144) * TAU + phase;
      const x = Math.cos(a) * rx;
      const z = Math.sin(a) * rz;
      const y = Math.sin(a) * tilt;
      const p = project({ x, y, z });
      if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
  }

  function drawProbe(topY, scan) {
    const center = project({ x: 0, y: topY, z: .05 });
    const scale = Math.min(width, height) * .32;
    const size = Math.max(25, Math.min(38, scale * .2));
    const left = center.x - size * .5;
    const top = center.y - size * .55;
    // Retractable tether and the short scan beam.
    ctx.save();
    ctx.strokeStyle = 'rgba(91,220,248,.64)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(center.x, 0); ctx.lineTo(center.x, top); ctx.stroke();
    const beamAlpha = scan ? .46 : .16;
    const beam = ctx.createLinearGradient(center.x, top + size, center.x, height * .47);
    beam.addColorStop(0, `rgba(72,214,250,${beamAlpha})`); beam.addColorStop(1, 'rgba(72,214,250,0)');
    ctx.fillStyle = beam; ctx.fillRect(center.x - 6, top + size, 12, Math.max(0, height * .47 - top - size));
    // Probe body, luminous lower lens, and restrained orange status marks.
    glow('rgba(63,195,235,.45)', 15);
    const shell = ctx.createLinearGradient(left, top, left + size, top + size);
    shell.addColorStop(0, '#294d5c'); shell.addColorStop(.42, '#102c3a'); shell.addColorStop(1, '#081922');
    ctx.fillStyle = shell; ctx.strokeStyle = 'rgba(132,231,248,.88)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(left, top, size, size * .78, size * .21); ctx.fill(); ctx.stroke(); clearGlow();
    ctx.fillStyle = 'rgba(255,157,90,.95)'; ctx.fillRect(left + size * .18, top + size * .18, 2, size * .13);
    ctx.fillRect(left + size * .8, top + size * .18, 2, size * .13);
    glow('#5be2ff', 14); ctx.fillStyle = '#6ee9ff';
    ctx.beginPath(); ctx.ellipse(center.x, top + size * .79, size * .22, size * .085, 0, 0, TAU); ctx.fill(); clearGlow();
    ctx.restore();
    return center;
  }

  function draw() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    const cx = width * .51, cy = height * .53;
    const scanCycle = elapsed % 7.2;
    const descend = scanCycle < 1.6 ? ease(scanCycle / 1.6) : scanCycle > 5.3 ? 1 - ease((scanCycle - 5.3) / 1.9) : 1;
    const probeY = 1.82 - descend * .56;
    const scanning = scanCycle >= 1.6 && scanCycle < 5.3;

    // Orbital field behind the neural structure.
    drawRing(1.51, .55, .15, 'rgba(77,203,237,.36)', 1.1, elapsed * .05);
    drawRing(1.28, .48, -.2, 'rgba(93,157,223,.19)', .8, -elapsed * .04);
    drawRing(1.66, .58, .36, 'rgba(255,157,90,.26)', .75, elapsed * .025);

    // Connections are drawn in depth order so the core has a real parallax feel.
    const projected = nodes.map(project);
    const orderedEdges = edges.map(([a, b]) => ({ a: projected[a], b: projected[b], z: (projected[a].z + projected[b].z) / 2 })).sort((a, b) => a.z - b.z);
    for (const e of orderedEdges) {
      const front = e.z > .1;
      ctx.strokeStyle = front ? 'rgba(83,208,242,.39)' : 'rgba(62,142,177,.18)';
      ctx.lineWidth = front ? 1 : .7;
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
    }

    // Inner core glow and a second wireframe layer.
    const coreRadius = Math.min(width, height) * (.082 + .009 * Math.sin(elapsed * 2.2));
    const radial = ctx.createRadialGradient(cx, cy, 1, cx, cy, coreRadius * 1.7);
    radial.addColorStop(0, 'rgba(78,222,255,.27)'); radial.addColorStop(.38, 'rgba(29,143,202,.13)'); radial.addColorStop(1, 'rgba(10,39,57,0)');
    ctx.fillStyle = radial; ctx.beginPath(); ctx.arc(cx, cy, coreRadius * 1.7, 0, TAU); ctx.fill();
    for (let i = 0; i < projected.length; i++) {
      const p = projected[i];
      const front = p.z > 0;
      const r = (front ? 2.15 : 1.35) * (Math.min(width, height) / 500);
      glow(front ? 'rgba(69,214,248,.7)' : 'rgba(55,151,198,.35)', front ? 8 : 4);
      ctx.fillStyle = front ? 'rgba(141,239,255,.94)' : 'rgba(92,180,213,.52)';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.1, r), 0, TAU); ctx.fill(); clearGlow();
    }
    // Core focal node.
    glow('#56dff9', 22); ctx.fillStyle = '#b8f6ff'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, coreRadius * .12), 0, TAU); ctx.fill(); clearGlow();
    ctx.strokeStyle = 'rgba(103,226,249,.68)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, coreRadius * 1.36, coreRadius * .42, -.12, 0, TAU); ctx.stroke();

    // Flowing data pulses follow the orbital tracks.
    for (const p of particles) {
      const t = (p.t + elapsed * p.speed) % 1;
      const angle = t * TAU;
      const radius = 1.32 + p.lane * .055;
      const pos = project({ x: Math.cos(angle) * radius, y: Math.sin(angle) * .16, z: Math.sin(angle) * .48 });
      const alpha = .38 + .55 * (.5 + .5 * Math.sin(t * TAU * 2));
      const color = p.warm ? `rgba(255,165,94,${alpha})` : `rgba(98,225,250,${alpha})`;
      glow(color, p.warm ? 9 : 7); ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, p.size, 0, TAU); ctx.fill(); clearGlow();
    }

    drawProbe(probeY, scanning);
    // Small instrument reticle around the center.
    ctx.save(); ctx.strokeStyle = 'rgba(126,196,213,.24)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.arc(cx, cy, Math.min(width, height) * .235, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + elapsed * .03;
      const x = cx + Math.cos(a) * Math.min(width, height) * .235;
      const y = cy + Math.sin(a) * Math.min(width, height) * .235;
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
    }
    ctx.restore();
  }

  function ease(v) { return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }
  function animate() {
    if (!paused) {
      elapsed += 1 / 60;
      if (!dragging) targetYaw += .0018;
      yaw += (targetYaw - yaw) * .045;
      pitch += (targetPitch - pitch) * .045;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function updateToggle() {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
    toggle.innerHTML = `<span class="pause-icon" aria-hidden="true">${paused ? '▶' : 'Ⅱ'}</span><span>${paused ? 'Resume motion' : 'Pause motion'}</span>`;
  }
  toggle?.addEventListener('click', () => { paused = !paused; updateToggle(); if (!paused) draw(); });
  canvas.addEventListener('pointerdown', event => { dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    targetYaw += (event.clientX - lastX) * .008;
    targetPitch = Math.max(-.76, Math.min(.76, targetPitch + (event.clientY - lastY) * .006));
    lastX = event.clientX; lastY = event.clientY;
    if (paused) { yaw = targetYaw; pitch = targetPitch; draw(); }
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); } else if (!paused) animate(); });
  updateToggle(); resize(); animate();
})();

