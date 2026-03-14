import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

interface AuroraProps {
  colorStops?: [string, string, string];
  speed?: number;
  blend?: number;
  amplitude?: number;
}

const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uBlend;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  float t = uTime * 0.4;
  vec2 uv = vUv;

  float n1 = snoise(vec2(uv.x * 2.0 + t * 0.3, uv.y * 1.5 - t * 0.2)) * uAmplitude;
  float n2 = snoise(vec2(uv.x * 1.5 - t * 0.2, uv.y * 2.0 + t * 0.15)) * uAmplitude;
  float n3 = snoise(vec2(uv.x * 3.0 + t * 0.1, uv.y * 1.0 - t * 0.3)) * uAmplitude;

  float band1 = smoothstep(0.0, 0.6, 1.0 - abs(uv.y - 0.75 + n1 * 0.25));
  float band2 = smoothstep(0.0, 0.5, 1.0 - abs(uv.y - 0.55 + n2 * 0.2));
  float band3 = smoothstep(0.0, 0.4, 1.0 - abs(uv.y - 0.35 + n3 * 0.3));

  vec3 bg = vec3(0.03, 0.03, 0.08);
  vec3 col = bg;
  col = mix(col, uColor1, band1 * 0.7);
  col = mix(col, uColor2, band2 * 0.6);
  col = mix(col, uColor3, band3 * 0.5);

  col = mix(bg, col, uBlend);
  gl_FragColor = vec4(col, 1.0);
}
`;

function hexToVec3(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

export const Aurora = ({
  colorStops = ['#1e3a8a', '#0ea5e9', '#38bdf8'],
  speed = 1.0,
  blend = 0.85,
  amplitude = 1.0,
}: AuroraProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: false, antialias: false });
    const gl = renderer.gl;
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    container.appendChild(gl.canvas);

    const resize = () => {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
    };
    resize();
    window.addEventListener('resize', resize);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uBlend: { value: blend },
        uColor1: { value: hexToVec3(colorStops[0]) },
        uColor2: { value: hexToVec3(colorStops[1]) },
        uColor3: { value: hexToVec3(colorStops[2]) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    let rafId: number;
    let startTime = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      program.uniforms.uTime.value = ((performance.now() - startTime) / 1000) * speed;
      renderer.render({ scene: mesh });
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [colorStops, speed, blend, amplitude]);

  return (
    <div
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
};
