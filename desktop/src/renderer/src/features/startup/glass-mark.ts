// The landing site's loading screen (apps/web/src/landing/GlassLogo.tsx) for the startup splash: the
// Eye of Ra as liquid glass, found by a rotating beam of light. Keep the shader in sync with the landing.
import { BITE, BODY, PUPIL, SPIRAL, VIEW_H, VIEW_W } from "@bob/brand/bob-mark-paths";

/** Seconds for the light to find the shape. */
const INTRO = 3.2;

const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

// R = coverage, G = bevel height, B = wide halo. The glass refracts a virtual studio: one rotating beam + soft keys.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uAspect, uTime, uReveal, uBeam;
uniform vec2 uMouse;
#define PI 3.14159265
float adist(float a){ return abs(mod(a + PI, 2. * PI) - PI); }
vec3 env(vec2 p){
  float a = atan(p.y, p.x), r = length(p);
  float beam = exp(-pow(adist(a - uBeam) * 3., 2.)) + .3 * exp(-pow(adist(a - uBeam - PI) * 5., 2.));
  vec3 c = vec3(.006);
  c += beam * vec3(.9) * smoothstep(0., .55, r) * .9;
  // softbox strips for the glass to bend
  c += vec3(.85) * smoothstep(.04, .0, abs(p.y - .3 - .02 * sin(uTime * .4))) * .85;
  c += vec3(.5) * smoothstep(.06, .0, abs(p.y + .34 + .02 * cos(uTime * .3))) * .45;
  c += vec3(1.) * exp(-dot(p - uMouse, p - uMouse) * 14.) * .9;
  return c;
}
void main(){
  vec2 st = vec2(vUv.x, 1. - vUv.y);
  vec4 t = texture2D(uTex, st);
  vec2 p = (vUv - .5) * vec2(uAspect, 1.);
  vec2 e = uTexel * 1.5;
  float hx = texture2D(uTex, st - vec2(e.x, 0.)).g - texture2D(uTex, st + vec2(e.x, 0.)).g;
  float hy = texture2D(uTex, st + vec2(0., e.y)).g - texture2D(uTex, st - vec2(0., e.y)).g;
  vec3 n = normalize(vec3(hx * 9., hy * 9., 1.));
  vec2 o = n.xy * .28;
  vec3 refr = vec3(env(p - o).r, env(p - o * 1.1).g, env(p - o * 1.2).b);
  vec3 L = normalize(vec3(cos(uBeam), sin(uBeam), .5));
  vec3 Lm = normalize(vec3(uMouse * 1.6, .7));
  float spec = pow(max(dot(n, normalize(L + vec3(0, 0, 1))), 0.), 60.) * 1.3
             + pow(max(dot(n, normalize(Lm + vec3(0, 0, 1))), 0.), 110.) * .9;
  float rim = smoothstep(.03, .45, 1. - n.z);
  float side = dot(normalize(n.xy + 1e-5), normalize(L.xy));
  float beamHere = exp(-pow(adist(atan(p.y, p.x) - uBeam) * 2., 2.));
  vec3 glass = refr * .85 + vec3(.035) + spec
             + rim * vec3(.85) * (.16 + .95 * max(side, 0.) * (.45 + .8 * beamHere))
             + rim * vec3(.6) * .28 * max(-side, 0.)
             + rim * (.5 + .5 * cos(6.2832 * (rim * 1.3 + vec3(0., .33, .67)) + uTime * .25)) * .06;
  float show = clamp(mix(beamHere * rim * 1.4 + beamHere * .12, 1., uReveal), 0., 1.);
  float cov = t.r * show;
  float lit = max(max(glass.r, glass.g), glass.b);
  float halo = max(t.b - t.r, 0.) * (.12 + .6 * beamHere) * (.3 + .7 * uReveal);
  float cone = beamHere * smoothstep(.62, .05, length(p)) * .05 * (1. - .75 * uReveal);
  vec3 glow = vec3(.8) * halo + vec3(.85) * cone;
  // premultiplied: the glass adds its light and only partly hides what is behind it
  gl_FragColor = vec4(glass * cov + glow, cov * clamp(.45 + lit, 0., 1.) + (halo + cone) * .4);
}`;

function boxBlur(src: Float32Array, w: number, h: number, r: number, passes: number) {
  const a = src.slice();
  const b = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(Math.max(x, 0), w - 1)] ?? 0;
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * inv;
        acc += (a[row + Math.min(x + r + 1, w - 1)] ?? 0) - (a[row + Math.max(x - r, 0)] ?? 0);
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(Math.max(y, 0), h - 1) * w + x] ?? 0;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * inv;
        acc += (b[Math.min(y + r + 1, h - 1) * w + x] ?? 0) - (b[Math.max(y - r, 0) * w + x] ?? 0);
      }
    }
  }
  return a;
}

function rasterize(width: number) {
  const pad = Math.round(width * 0.14);
  const s = (width - pad * 2) / VIEW_W;
  const height = Math.round(VIEW_H * s + pad * 2);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(s, 0, 0, s, pad, pad);
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D(BODY));
  ctx.fill(new Path2D(SPIRAL));
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.arc(BITE.cx, BITE.cy, BITE.r, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.fill(new Path2D(PUPIL));
  const px = ctx.getImageData(0, 0, width, height).data;
  const cov = new Float32Array(width * height);
  for (let i = 0; i < cov.length; i++) cov[i] = (px[i * 4 + 3] ?? 0) / 255;
  const bevel = boxBlur(cov, width, height, Math.round(width / 220), 3);
  const halo = boxBlur(cov, width, height, Math.round(width / 40), 3);
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < cov.length; i++) {
    out[i * 4] = (cov[i] ?? 0) * 255;
    out[i * 4 + 1] = Math.min(1, (bevel[i] ?? 0) * 1.25) * 255;
    out[i * 4 + 2] = Math.min(1, (halo[i] ?? 0) * 2.2) * 255;
    out[i * 4 + 3] = 255;
  }
  return { out, width, height };
}

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
  return sh;
}

/**
 * Draws the glass mark on `canvas` until the returned stop function runs. `onRevealed` runs once,
 * shortly before the reveal ends; with reduced motion the mark shows in full at once. Answers null
 * without WebGL, so the caller shows the flat mark instead.
 */
export function startGlassMark(
  canvas: HTMLCanvasElement,
  { reduce, onRevealed }: { reduce: boolean; onRevealed: () => void },
): (() => void) | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  const mark = gl && rasterize(1100);
  const prog = gl?.createProgram();
  if (!gl || !mark || !prog) return null;
  const { out, width, height } = mark;
  try {
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
  } catch {
    return null;
  }
  canvas.style.aspectRatio = `${width} / ${height}`;
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ] as const) {
    gl.texParameteri(gl.TEXTURE_2D, key, value);
  }
  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform2f(u("uTexel"), 1 / width, 1 / height);
  gl.uniform1f(u("uAspect"), width / height);
  const uTime = u("uTime");
  const uReveal = u("uReveal");
  const uBeam = u("uBeam");
  const uMouse = u("uMouse");

  const mouse = { x: 0.35, y: 0.3, tx: 0.35, ty: 0.3 };
  const onMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouse.tx = ((event.clientX - rect.left) / rect.width - 0.5) * (width / height);
    mouse.ty = -((event.clientY - rect.top) / rect.height - 0.5);
  };
  addEventListener("pointermove", onMove);

  const resize = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const start = performance.now() - (reduce ? INTRO * 1000 : 0);
  let raf = 0;
  let told = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const t = (now - start) / 1000;
    const k = Math.min(t / INTRO, 1);
    const ease = 1 - (1 - k) ** 3;
    const beam = -Math.PI / 2 + ease * Math.PI * 2.4 + Math.max(t - INTRO, 0) * 0.32;
    const reveal = Math.min(Math.max((t - 1.3) / (INTRO - 1.1), 0), 1);
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    gl.uniform1f(uTime, t);
    gl.uniform1f(uBeam, beam);
    gl.uniform1f(uReveal, reveal * reveal * (3 - 2 * reveal));
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!told && t > INTRO - 0.6) {
      told = true;
      onRevealed();
    }
    if (reduce && told) cancelAnimationFrame(raf);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("pointermove", onMove);
    observer.disconnect();
  };
}
