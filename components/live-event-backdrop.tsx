"use client";

import { useEffect, useRef } from "react";

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Both courtyard artworks share these flag and flame coordinates at 1536 × 1024.
const FRAGMENT = `
precision highp float;
uniform sampler2D scene;
uniform float time;
varying vec2 uv;
const vec2 size = vec2(1536.0, 1024.0);

float edge(vec2 p, vec2 a, vec2 b) {
  vec2 v = b - a;
  return (v.x * (p.y - a.y) - v.y * (p.x - a.x)) / length(v);
}

float banner(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d, vec2 e) {
  float distance = min(min(edge(p,a,b), edge(p,b,c)), min(edge(p,c,d), edge(p,d,e)));
  distance = min(distance, edge(p,e,a));
  return smoothstep(-6.0, 5.0, distance);
}

vec3 sampleScene(vec2 p) {
  return texture2D(scene, vec2(p.x / size.x, 1.0 - p.y / size.y)).rgb;
}

void main() {
  vec2 p = vec2(uv.x, 1.0 - uv.y) * size;
  vec2 offset = vec2(0.0);
  float clothLight = 0.0;
  float fireLight = 0.0;
  float glow = 0.0;

  // Pin the cloth to its rail and let the lower fabric catch a gentle gust.
  if (p.y > 205.0 && p.y < 532.0 && (p.x < 200.0 || p.x > 1350.0)) {
    float left = banner(p, vec2(51.0,214.0), vec2(184.0,232.0), vec2(184.0,459.0), vec2(121.0,519.0), vec2(49.0,459.0));
    float right = banner(p, vec2(1367.0,234.0), vec2(1498.0,215.0), vec2(1510.0,458.0), vec2(1446.0,521.0), vec2(1373.0,462.0));
    float mask = max(left, right);
    float phase = p.x < 768.0 ? 0.0 : 0.8;
    float freeCloth = pow(smoothstep(225.0, 510.0, p.y), 0.85);
    float gust = 0.8 + 0.2 * sin(time * 0.67);
    float ripple = sin(p.y * 0.036 - time * 1.9 + phase);
    float fold = sin(p.x * 0.067 + p.y * 0.022 - time * 2.5 + phase);
    offset.x += mask * freeCloth * gust * (4.8 * ripple + 1.7 * fold);
    offset.y += mask * freeCloth * 1.1 * sin(p.y * 0.029 - time * 1.8 + phase);
    clothLight = mask * freeCloth * (0.055 * fold + 0.025 * ripple);
  }

  // Confine movement to the flame, with an anchored base above the iron bowl.
  if (p.y > 515.0 && p.y < 727.0 && (p.x < 235.0 || p.x > 1300.0)) {
    bool leftFire = p.x < 768.0;
    vec2 centre = leftFire ? vec2(105.0,612.0) : vec2(1449.0,613.0);
    float phase = leftFire ? 0.0 : 2.4;
    vec2 local = p - centre;
    float shape = 1.0 - smoothstep(0.65, 1.05, length(local / vec2(63.0,82.0)));
    float flame = shape * (1.0 - smoothstep(642.0,666.0,p.y));
    float lift = clamp((660.0-p.y)/105.0,0.0,1.0);
    offset.x += flame * lift * (3.7*sin(p.y*0.095-time*5.1+phase) + 1.8*sin(time*3.8+phase));
    offset.y += flame * lift * (3.0*sin(p.x*0.11+time*6.3+phase) + 1.9*sin(time*4.3+phase));
    float flicker = 0.065*sin(time*3.7+phase) + 0.035*sin(time*7.9+phase) + 0.018*sin(time*12.3+phase);
    fireLight = flame * flicker;
    glow = (1.0-smoothstep(0.2,1.0,length(local/vec2(115.0,106.0)))) * flicker;
  }

  vec3 colour = sampleScene(p - offset);
  colour *= 1.0 + clothLight + fireLight;
  colour += vec3(0.34,0.12,0.015) * glow;
  gl_FragColor = vec4(colour,1.0);
}`;

export default function LiveEventBackdrop() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !image || !canvas) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let release = () => {};

    function setup() {
      release();
      release = () => {};
      wrapper!.dataset.animated = "false";
      if (reducedMotion.matches || !image!.complete || !image!.naturalWidth) return;
      const gl = canvas!.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
      if (!gl) return;
      const shaders: WebGLShader[] = [];
      const program = gl.createProgram();
      const buffer = gl.createBuffer();
      const texture = gl.createTexture();
      let frame = 0;
      let lastFrame = 0;
      let elapsed = 0;
      let nearViewport = true;
      let disposed = false;
      let failed = false;
      let ready = false;
      let observer: IntersectionObserver | undefined;
      const timeLocation = { current: null as WebGLUniformLocation | null };

      function stop() { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; }
      function draw(timestamp: number) {
        frame = 0;
        if (disposed || failed || !nearViewport || document.hidden || reducedMotion.matches) return;
        if (!lastFrame || timestamp - lastFrame >= 1000 / 30) {
          elapsed += lastFrame ? Math.min(timestamp - lastFrame, 100) / 1000 : 0;
          lastFrame = timestamp;
          gl!.uniform1f(timeLocation.current, elapsed);
          gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
          if (!ready) { ready = true; wrapper!.dataset.animated = "true"; }
        }
        frame = requestAnimationFrame(draw);
      }
      function updateVisibility() {
        if (document.hidden || !nearViewport || reducedMotion.matches || failed) stop();
        else if (!frame && !disposed) frame = requestAnimationFrame(draw);
      }
      function contextLost(event: Event) {
        event.preventDefault();
        failed = true;
        stop();
        wrapper!.dataset.animated = "false";
      }
      function resize() {
        // Limit the background to 1.6 MP / 30 fps, and less on narrow screens.
        canvas!.width = window.innerWidth <= 700 ? 1023 : 1536;
        canvas!.height = canvas!.width * 2 / 3;
        gl!.viewport(0, 0, canvas!.width, canvas!.height);
        gl!.uniform1f(timeLocation.current, elapsed);
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      }
      release = () => {
        disposed = true;
        stop();
        observer?.disconnect();
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", updateVisibility);
        canvas!.removeEventListener("webglcontextlost", contextLost);
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        shaders.forEach(shader => gl.deleteShader(shader));
        wrapper!.dataset.animated = "false";
      };

      try {
        if (!program || !buffer || !texture) throw new Error("Scene renderer unavailable");
        for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Scene shader unavailable");
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Scene shader unsupported");
          gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Scene renderer unsupported");
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image!);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, "scene"), 0);
        timeLocation.current = gl.getUniformLocation(program, "time");
        resize();
        canvas!.addEventListener("webglcontextlost", contextLost);
        window.addEventListener("resize", resize, { passive: true });
        document.addEventListener("visibilitychange", updateVisibility);
        observer = new IntersectionObserver(entries => { nearViewport = entries[0]?.isIntersecting ?? false; updateVisibility(); });
        observer.observe(wrapper!);
        updateVisibility();
      } catch {
        // The original image remains available without WebGL or after a failure.
        release();
      }
    }

    image.addEventListener("load", setup);
    reducedMotion.addEventListener("change", setup);
    setup();
    return () => {
      image.removeEventListener("load", setup);
      reducedMotion.removeEventListener("change", setup);
      release();
    };
  }, []);

  return <div ref={wrapperRef} className="live-event-backdrop" aria-hidden="true">
    <img ref={imageRef} src="/hijgend-hert-event-courtyard.webp" alt="" width="1536" height="1024" fetchPriority="high"/>
    <canvas ref={canvasRef} className="live-event-animation" width="1536" height="1024"/>
  </div>;
}
