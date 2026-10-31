export const vertexShader = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const fragmentShader = /* glsl */`
uniform sampler2D uTexture;
uniform float uTime;
uniform float uHover;
uniform float uRevealRadius;
uniform float uAlpha;

varying vec2 vUv;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Returns the nearest hex cell center. Tries two candidate grids and picks closer.
vec2 hexCenter(vec2 p, float size) {
  float w = size * 2.0;
  float h = size * 1.7320508; // sqrt(3)

  vec2 a = vec2(floor(p.x / w), floor(p.y / h));
  vec2 b = vec2(floor((p.x - size) / w), floor((p.y - h * 0.5) / h));

  vec2 ca = vec2((a.x + 0.5) * w,        (a.y + 0.5) * h);
  vec2 cb = vec2((b.x + 0.5) * w + size, (b.y + 0.5) * h + h * 0.5);

  return length(p - ca) < length(p - cb) ? ca : cb;
}

void main() {
  if (length(vUv - vec2(0.5)) < uRevealRadius) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  float hexSize = 0.03; // hex "radius" in UV space — tune for detail vs style

  vec2 center = hexCenter(vUv, hexSize);
  vec2 noiseOff = vec2(
    noise(center * 3.0 + vec2(uTime * 0.35, 0.0)),
    noise(center * 3.0 + vec2(0.0, uTime * 0.35))
  ) * 0.03;

  vec3 color = texture2D(uTexture, clamp(center + noiseOff, 0.0, 1.0)).rgb;
  color += uHover * 0.25;

  gl_FragColor = vec4(color, uAlpha);
}
`;
