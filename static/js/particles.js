/**
 * Particles.js — 背景粒子系统
 * 纯 Canvas 实现，无任何外部依赖
 */

let canvas = null;
let ctx = null;
let particles = [];
let animationId = null;
let mouseX = -10000;
let mouseY = -10000;
let isRunning = false;

const PARTICLE_COLORS = ['#C49B5C', '#E8DFD0', '#8B2635'];
const PARTICLE_COUNT = 35;
const BASE_RADIUS_MIN = 3;
const BASE_RADIUS_MAX = 7;
const OPACITY_MIN = 0.15;
const OPACITY_MAX = 0.35;
const SPEED = 0.15;
const WAVE_AMP = 0.4;
const WAVE_FREQ = 0.008;
const PUSH_RADIUS = 120;
const PUSH_FORCE = 0.5;
const FRAME_INTERVAL = 1000 / 30; // ~30fps cap

function createParticle(w, h) {
  const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    baseX: 0,
    baseY: 0,
    vx: (Math.random() - 0.5) * SPEED,
    vy: (Math.random() - 0.5) * SPEED,
    radius: BASE_RADIUS_MIN + Math.random() * (BASE_RADIUS_MAX - BASE_RADIUS_MIN),
    color: color,
    opacity: OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN),
    phase: Math.random() * Math.PI * 2,
    waveAmp: WAVE_AMP * (0.5 + Math.random()),
    waveFreq: WAVE_FREQ * (0.8 + Math.random() * 0.4),
  };
}

function drawParticle(p, time) {
  // Sin波上下浮动
  const waveOffset = Math.sin(time * p.waveFreq + p.phase) * p.waveAmp;
  let drawX = p.x;
  let drawY = p.y + waveOffset;

  // 鼠标推开力
  const dx = drawX - mouseX;
  const dy = drawY - mouseY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < PUSH_RADIUS && dist > 0) {
    const force = (1 - dist / PUSH_RADIUS) * PUSH_FORCE;
    drawX += (dx / dist) * force;
    drawY += (dy / dist) * force;
  }

  ctx.beginPath();
  ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.globalAlpha = p.opacity;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function animate(time) {
  if (!isRunning || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;

    // 边界反弹
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

    // 边界钳位
    p.x = Math.max(0, Math.min(canvas.width, p.x));
    p.y = Math.max(0, Math.min(canvas.height, p.y));

    drawParticle(p, time);
  }

  animationId = requestAnimationFrame(animate);
}

export function initParticles(canvasEl) {
  if (isRunning) destroyParticles();
  if (!canvasEl) return;

  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  isRunning = true;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const w = canvas.width;
  const h = canvas.height;
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(createParticle(w, h));
  }

  // 鼠标跟踪
  const onMouseMove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };
  const onMouseLeave = () => {
    mouseX = -10000;
    mouseY = -10000;
  };
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas._particleHandlers = { onMouseMove, onMouseLeave };

  animate(0);
}

export function destroyParticles() {
  isRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (canvas) {
    canvas.removeEventListener('mousemove', canvas._particleHandlers?.onMouseMove);
    canvas.removeEventListener('mouseleave', canvas._particleHandlers?.onMouseLeave);
  }
  window.removeEventListener('resize', resizeCanvas);
  particles = [];
  ctx = null;
  canvas = null;
}
