import './style.css';
import { callAigramAPI, isInAigram, telegramId } from './shared/runtime/bridge.ts';
import { vertexShaderSource, fragmentShaderSource } from './shaders.js';

const query = new URLSearchParams(location.search);
const baseline = query.get('baseline') === '1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const localeOverride = localStorage.getItem('game_locale');
const locale = localeOverride === 'en' || localeOverride === 'zh'
  ? localeOverride
  : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const COPY = {
  zh: { loading: '正在注水', settled: '倒影已平静', errorTitle: '水面没有显现', errorBody: '请重新载入这片倒影', retry: '重新载入' },
  en: { loading: 'FILLING THE VEIL', settled: 'REFLECTION SETTLED', errorTitle: 'REFLECTION LOST', errorBody: 'Reload this sheet of water', retry: 'RELOAD' }
}[locale];

const stage = document.querySelector('.wv-stage');
const canvas = document.querySelector('.wv-canvas');
const ghost = document.querySelector('#ghost');
const loading = document.querySelector('#loading');
const sealed = document.querySelector('#sealed');
const identityName = document.querySelector('#identityName');
const sealedName = document.querySelector('#sealedName');
const errorPanel = document.querySelector('#error');
document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
document.querySelector('#loadingText').textContent = COPY.loading;
document.querySelector('#sealedTitle').textContent = COPY.settled;
document.querySelector('#errorTitle').textContent = COPY.errorTitle;
document.querySelector('#errorBody').textContent = COPY.errorBody;
document.querySelector('#retry').textContent = COPY.retry;
document.querySelector('#retry').addEventListener('click', () => location.reload());
if (baseline) document.body.classList.add('wv-baseline');

const params = {
  blueish: .6,
  scale: 7,
  illumination: .15,
  surfaceDistortion: .07,
  waterDistortion: .03
};
const pointer = { x: .5, y: .5, strength: 0, targetStrength: 0 };
let gl;
let program;
let uniforms;
let texture;
let image;
let raf = 0;
let dragging = false;
let userActed = false;
let lastAction = 0;
let settledShown = false;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const next = new Image();
    next.decoding = 'async';
    if (new URL(src, location.href).origin !== location.origin) next.crossOrigin = 'anonymous';
    next.onload = () => resolve(next);
    next.onerror = reject;
    next.src = src;
  });
}

async function resolveIdentity() {
  if (baseline) return { name: 'ORIGINAL', image: './upstream-original.jpg' };
  const debugAvatar = query.get('avatar_url');
  const debugName = query.get('user_name');
  if (debugAvatar || debugName) {
    return { name: debugName || 'YINXINGHUAN', image: debugAvatar || './publisher-avatar.png' };
  }
  if (isInAigram && telegramId) {
    try {
      const response = await callAigramAPI('AW.PROFILE.GET', { telegram_id: telegramId });
      const profile = response?.data ?? response;
      const name = profile?.user_name || profile?.username || profile?.name;
      const avatar = profile?.head_url || profile?.avatar_url;
      if (avatar || name) return { name: name || 'YINXINGHUAN', image: avatar || './publisher-avatar.png' };
    } catch (error) {
      console.warn('Profile unavailable, using publisher fallback.', error);
    }
  }
  return { name: 'YINXINGHUAN', image: './publisher-avatar.png' };
}

function compile(source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function initWebGL() {
  gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL unavailable');
  const vertex = compile(vertexShaderSource, gl.VERTEX_SHADER);
  const fragment = compile(fragmentShaderSource, gl.FRAGMENT_SHADER);
  program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index += 1) {
    const name = gl.getActiveUniform(program, index).name;
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.u_image_texture, 0);
}

function uploadTexture() {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.uniform1f(uniforms.u_img_ratio, image.naturalWidth / image.naturalHeight);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(2, Math.round(innerWidth * dpr));
  canvas.height = Math.max(2, Math.round(innerHeight * dpr));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform1f(uniforms.u_ratio, canvas.width / canvas.height);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  };
}

function beginInteraction(event) {
  if (baseline) return;
  event.preventDefault();
  userActed = true;
  settledShown = false;
  sealed.classList.remove('wv-sealed--show');
  ghost.classList.remove('wv-ghost--show');
  dragging = true;
  canvas.setPointerCapture?.(event.pointerId);
  Object.assign(pointer, pointFromEvent(event), { targetStrength: 1 });
  lastAction = performance.now();
}

function moveInteraction(event) {
  if (!dragging || baseline) return;
  event.preventDefault();
  Object.assign(pointer, pointFromEvent(event), { targetStrength: 1 });
  lastAction = performance.now();
}

function endInteraction() {
  if (!dragging) return;
  dragging = false;
  pointer.targetStrength = 0;
  lastAction = performance.now();
}

function render(now) {
  pointer.strength += (pointer.targetStrength - pointer.strength) * (reducedMotion ? .2 : .07);
  gl.uniform1f(uniforms.u_time, now);
  gl.uniform1f(uniforms.u_blueish, params.blueish);
  gl.uniform1f(uniforms.u_scale, params.scale);
  gl.uniform1f(uniforms.u_illumination, params.illumination);
  gl.uniform1f(uniforms.u_surface_distortion, params.surfaceDistortion);
  gl.uniform1f(uniforms.u_water_distortion, params.waterDistortion);
  gl.uniform2f(uniforms.u_touch, pointer.x, pointer.y);
  gl.uniform1f(uniforms.u_touch_strength, pointer.strength);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  if (userActed && !dragging && !settledShown && now - lastAction > 1250 && pointer.strength < .04) {
    settledShown = true;
    sealed.classList.add('wv-sealed--show');
    window.setTimeout(() => sealed.classList.remove('wv-sealed--show'), 1500);
  }
  raf = requestAnimationFrame(render);
}

async function start() {
  try {
    initWebGL();
    const identity = await resolveIdentity();
    identityName.textContent = identity.name.toUpperCase();
    sealedName.textContent = identity.name.toUpperCase();
    try {
      image = await loadImage(identity.image);
    } catch (identityImageError) {
      if (baseline || identity.image.endsWith('publisher-avatar.png')) throw identityImageError;
      console.warn('Player avatar unavailable, using publisher fallback.', identityImageError);
      image = await loadImage('./publisher-avatar.png');
    }
    uploadTexture();
    resize();
    addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', beginInteraction);
    canvas.addEventListener('pointermove', moveInteraction);
    canvas.addEventListener('pointerup', endInteraction);
    canvas.addEventListener('pointercancel', endInteraction);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(render);
    });
    stage.classList.add('wv-ready');
    loading.setAttribute('aria-hidden', 'true');
    raf = requestAnimationFrame(render);
    if (!baseline && !reducedMotion) {
      window.setTimeout(() => {
        if (userActed) return;
        ghost.classList.add('wv-ghost--show');
        pointer.x = .68;
        pointer.y = .48;
        pointer.targetStrength = .84;
        window.setTimeout(() => { if (!userActed) pointer.targetStrength = 0; }, 900);
      }, 900);
    }
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    errorPanel.hidden = false;
  }
}

start();
