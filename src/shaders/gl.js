/* ═══════════════════════════════════════════════════════════════════
   src/shaders/gl.js — liquid-chrome background for Dial (on-device)
   -------------------------------------------------------------------
   Target: the 800x480 device panel. Canvas is sized from clientWidth/
   clientHeight at the device pixel ratio, capped at 2 for GPU headroom.
   No decorative linear gradients anywhere in this module — light is
   refractive/metallic only (domain-warped fbm chrome in WebGL2, flowing
   arcs + radial glows in the 2D fallback).
   -------------------------------------------------------------------
   initGL(canvas) -> { setEnergy(v), setVoiceLevel(v), setKnobGlow(v),
                       bloom(strength), tick(dt), dispose() }

   • WebGL2 path: domain-warped fbm liquid metal. Energy (audio level +
     knob velocity) drives flow speed + sheen; voiceLevel pulses an
     orange ring; knobGlow warms the rim; bloom() fires a white flash
     that decays in tick().
   • No WebGL2 / shader compile failure -> 2D-canvas fallback renderer
     (flowing concentric arcs) exposing the identical API.
   • The render loop is external: main.js calls tick(dt) every rAF.
   • No DOM access at module top level (canvas is passed in).
     prefers-reduced-motion is read lazily inside initGL.
   ═══════════════════════════════════════════════════════════════════ */

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform vec2  u_res;
uniform float u_time;
uniform float u_energy;    // 0..1 audio level + knob velocity
uniform float u_voice;     // 0..1 voice waveform ring
uniform float u_knobGlow;  // 0..1 warm rim glow
uniform float u_bloom;     // 0..1 decaying flash

float hash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

void main(){
  // centered coords, display-agnostic (the stage is circular)
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * (0.22 + u_energy * 0.85);

  // domain-warped liquid metal flow (3 fbm evals total — 60fps-safe)
  vec2 q = vec2(fbm(uv * 1.7 + vec2(0.0, t * 0.55)),
                fbm(uv * 1.7 + vec2(5.2, -t * 0.42)));
  float f = fbm(uv * 2.3 + q * 1.7 + vec2(t * 0.12, 0.0));

  // chrome ramp: deep graphite -> brushed silver
  vec3 base = vec3(0.030, 0.032, 0.040);
  vec3 mid  = vec3(0.095, 0.100, 0.125);
  vec3 hi   = vec3(0.72, 0.75, 0.82);
  float m = smoothstep(0.28, 0.86, f);
  float sheen = smoothstep(0.52, 0.95, f);
  vec3 col = mix(base, mid, m);
  col = mix(col, hi, pow(sheen, 3.0) * (0.30 + 0.70 * u_energy));

  // refractive diagonal light streak, bent by the flow field
  float streak = smoothstep(0.035, 0.0,
      abs(uv.x + uv.y * 0.62 - 0.22 + (f - 0.5) * 0.35));
  col += vec3(0.85, 0.92, 1.0) * streak * (0.22 + 0.45 * u_energy);

  // voice waveform ring — alive and musical
  float d = length(uv);
  float ringR = 0.27 + 0.05 * sin(u_time * 3.1) + u_energy * 0.03;
  float ring = smoothstep(0.025, 0.0, abs(d - ringR)) * u_voice;
  col += vec3(1.0, 0.30, 0.05) * ring * 1.35;

  // knob glow: warm light pooling at the rim
  float rim = smoothstep(0.40, 0.50, d);
  col += vec3(1.0, 0.42, 0.12) * rim * u_knobGlow * 0.55;

  // bloom flash (track-start bloom)
  col += vec3(1.0, 0.97, 0.94) * u_bloom * (0.55 + 0.45 * f);

  // circular falloff into the bezel
  col *= 1.0 - smoothstep(0.455, 0.5, d) * 0.9;
  col *= 0.45 + 0.55 * smoothstep(0.52, 0.30, d);

  // OLED grain
  col += (hash(gl_FragCoord.xy * 0.71 + fract(u_time) * 13.7) - 0.5) * 0.038;

  gl_FragColor = vec4(col, 1.0);
}
`;

const clamp01 = (v) => Math.min(1, Math.max(0, +v || 0));

function fitCanvas(canvas, dprCap = 2) {
  const dpr = Math.min(dprCap,
    (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  return { w, h };
}

function reducedMotion() {
  try {
    return typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/* ── WebGL2 path ──────────────────────────────────────────────────── */
function initWebGL2(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false,
    stencil: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('webgl2 unavailable');

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader compile failed: ' + log);
    }
    return s;
  };

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program link failed: ' + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // fullscreen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const uRes = U('u_res'), uTime = U('u_time'), uEnergy = U('u_energy'),
        uVoice = U('u_voice'), uKnob = U('u_knobGlow'), uBloom = U('u_bloom');

  const S = {
    time: Math.random() * 100, // decorrelate restarts; not part of determinism contract
    energy: 0, energyT: 0,
    voice: 0, voiceT: 0,
    knob: 0, knobT: 0,
    bloom: 0,
    reduced: reducedMotion(),
    dead: false,
  };

  function tick(dt) {
    if (S.dead) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const { w, h } = fitCanvas(canvas);
    // critically-damped-ish smoothing: every input feels wired, never laggy
    const kE = 1 - Math.exp(-dt * 7), kV = 1 - Math.exp(-dt * 14);
    S.energy += (S.energyT - S.energy) * kE;
    S.voice  += (S.voiceT - S.voice) * kV;
    S.knob   += (S.knobT - S.knob) * kE;
    S.bloom  *= Math.exp(-dt * 2.6);
    if (S.bloom < 0.003) S.bloom = 0;
    S.time += dt * (S.reduced ? 0.04 : 1);

    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, S.time);
    gl.uniform1f(uEnergy, S.energy);
    gl.uniform1f(uVoice, S.voice);
    gl.uniform1f(uKnob, S.knob);
    gl.uniform1f(uBloom, S.bloom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    S.dead = true;
    try {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch { /* noop */ }
  }

  return {
    setEnergy(v)    { S.energyT = clamp01(v); },
    setVoiceLevel(v){ S.voiceT  = clamp01(v); },
    setKnobGlow(v)  { S.knobT   = clamp01(v); },
    bloom(s = 1)    { S.bloom = Math.max(S.bloom, clamp01(s)); },
    tick,
    dispose,
  };
}

/* ── 2D-canvas fallback: flowing plasma arcs, same API ─────────────── */
function initFallback2D(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  const S = {
    time: 0,
    energy: 0, energyT: 0,
    voice: 0, voiceT: 0,
    knob: 0, knobT: 0,
    bloom: 0,
    reduced: reducedMotion(),
    dead: false,
  };
  const TAU = Math.PI * 2;

  function tick(dt) {
    if (S.dead) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const { w, h } = fitCanvas(canvas, 1.5);
    const kE = 1 - Math.exp(-dt * 7), kV = 1 - Math.exp(-dt * 14);
    S.energy += (S.energyT - S.energy) * kE;
    S.voice  += (S.voiceT - S.voice) * kV;
    S.knob   += (S.knobT - S.knob) * kE;
    S.bloom  *= Math.exp(-dt * 2.6);
    if (S.bloom < 0.003) S.bloom = 0;
    S.time += dt * (S.reduced ? 0.04 : 1);

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    ctx.fillStyle = '#08080b';
    ctx.fillRect(0, 0, w, h);

    // flowing concentric arcs — metallic greys, bent by "flow"
    for (let i = 0; i < 9; i++) {
      const f = i / 9;
      const rr = R * (0.10 + 0.88 * f) *
        (1 + 0.055 * Math.sin(S.time * (0.5 + f * 1.3) + i * 2.4) * (0.35 + S.energy));
      const a0 = S.time * (0.12 + f * 0.25) * (i % 2 ? 1 : -1) + i;
      const sweep = TAU * (0.35 + 0.5 * f);
      const lum = Math.round(14 + 90 * f * (0.5 + 0.5 * S.energy));
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, rr), a0, a0 + sweep);
      ctx.strokeStyle = `rgba(${lum},${lum + 4},${lum + 12},${0.16 + 0.5 * f})`;
      ctx.lineWidth = 1 + 7 * f * (0.4 + 0.6 * S.energy);
      ctx.stroke();
    }

    // voice ring
    if (S.voice > 0.01) {
      const vr = R * (0.30 + 0.05 * Math.sin(S.time * 3.1));
      ctx.beginPath(); ctx.arc(cx, cy, vr, 0, TAU);
      ctx.strokeStyle = `rgba(255,77,0,${0.85 * S.voice})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, vr * 1.12, 0, TAU);
      ctx.strokeStyle = `rgba(255,77,0,${0.25 * S.voice})`;
      ctx.lineWidth = 8;
      ctx.stroke();
    }

    // knob rim glow
    if (S.knob > 0.01) {
      const g = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
      g.addColorStop(0, 'rgba(255,77,0,0)');
      g.addColorStop(1, `rgba(255,110,20,${0.35 * S.knob})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // bloom flash
    if (S.bloom > 0) {
      ctx.fillStyle = `rgba(255,250,244,${0.55 * S.bloom})`;
      ctx.fillRect(0, 0, w, h);
    }

    // circular falloff into bezel
    const v = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  return {
    setEnergy(v)    { S.energyT = clamp01(v); },
    setVoiceLevel(v){ S.voiceT  = clamp01(v); },
    setKnobGlow(v)  { S.knobT   = clamp01(v); },
    bloom(s = 1)    { S.bloom = Math.max(S.bloom, clamp01(s)); },
    tick,
    dispose() { S.dead = true; },
  };
}

/* ── public entry ─────────────────────────────────────────────────── */
export function initGL(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('initGL needs a canvas element');
  }
  try {
    return initWebGL2(canvas);
  } catch (err) {
    // graceful degradation: never leave the stage black
    try {
      return initFallback2D(canvas);
    } catch (err2) {
      throw new Error('no renderable context: ' + err2.message);
    }
  }
}
