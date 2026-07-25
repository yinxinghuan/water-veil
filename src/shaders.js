export const vertexShaderSource = `
precision mediump float;
varying vec2 vUv;
attribute vec2 a_position;
void main() {
  vUv = .5 * (a_position + 1.);
  gl_Position = vec4(a_position, 0., 1.);
}`;

export const fragmentShaderSource = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D u_image_texture;
uniform float u_time;
uniform float u_ratio;
uniform float u_img_ratio;
uniform float u_blueish;
uniform float u_scale;
uniform float u_illumination;
uniform float u_surface_distortion;
uniform float u_water_distortion;
uniform vec2 u_touch;
uniform float u_touch_strength;

vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec2 mod289(vec2 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec3 permute(vec3 x) { return mod289(((x * 34.) + 1.) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(.211324865405187, .366025403784439, -.577350269189626, .024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
  vec3 m = max(.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.);
  m = m * m;
  m = m * m;
  vec3 x = 2. * fract(p * C.www) - 1.;
  vec3 h = abs(x) - .5;
  vec3 ox = floor(x + .5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - .85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130. * dot(m, g);
}
mat2 rotate2D(float r) { return mat2(cos(r), sin(r), -sin(r), cos(r)); }
float surfaceNoise(vec2 uv, float t, float scale) {
  vec2 n = vec2(.1);
  vec2 N = vec2(.1);
  mat2 m = rotate2D(.5);
  for (int j = 0; j < 10; j++) {
    uv *= m;
    n *= m;
    vec2 q = uv * scale + float(j) + n + (.5 + .5 * float(j)) * (mod(float(j), 2.) - 1.) * t;
    n += sin(q);
    N += cos(q) / scale;
    scale *= 1.2;
  }
  return N.x + N.y + .1;
}
void main() {
  vec2 uv = vUv;
  uv.y = 1. - uv.y;
  uv.x *= u_ratio;
  float t = .002 * u_time;
  float outerNoise = snoise((.3 + .1 * sin(t)) * uv + vec2(0., .2 * t));
  vec2 surfaceUv = 2. * uv + outerNoise * .2;
  float surface = surfaceNoise(surfaceUv, t, u_scale);
  surface *= pow(uv.y, .3);
  surface = pow(surface, 2.);

  vec2 imgUv = vUv - .5;
  if (u_ratio > u_img_ratio) imgUv.x *= u_ratio / u_img_ratio;
  else imgUv.y *= u_img_ratio / u_ratio;
  imgUv *= 1.4;
  imgUv += .5;
  imgUv.y = 1. - imgUv.y;

  vec2 touchUv = vec2(vUv.x, 1. - vUv.y);
  float touchDistance = distance(touchUv, u_touch);
  float touchWave = sin(touchDistance * 54. - t * 7.) * exp(-touchDistance * 8.) * u_touch_strength;
  vec2 touchDirection = normalize(touchUv - u_touch + vec2(.0001));
  imgUv += u_water_distortion * outerNoise;
  imgUv += u_surface_distortion * surface;
  imgUv += touchDirection * touchWave * .018;

  vec4 img = texture2D(u_image_texture, imgUv);
  img *= 1. + u_illumination * surface;
  vec3 color = img.rgb + u_illumination * vec3(1. - u_blueish, 1., 1.) * surface;
  float edgeWidth = .02;
  float edgeAlpha = smoothstep(0., edgeWidth, imgUv.x) * smoothstep(1., 1. - edgeWidth, imgUv.x);
  edgeAlpha *= smoothstep(0., edgeWidth, imgUv.y) * smoothstep(1., 1. - edgeWidth, imgUv.y);
  gl_FragColor = vec4(color * edgeAlpha, img.a * edgeAlpha);
}`;
