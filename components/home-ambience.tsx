"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { AntlerLights } from './clan-crest';
import SeasonalImage from './seasonal-image';

function useAmbientVisibility(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = true;
    const update = () => { element.dataset.motion = visible && !document.hidden ? "on" : "off"; };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [ref]);
}

export function WoodlandBackdrop() {
  const scene = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLDivElement>(null);
  useAmbientVisibility(scene);
  useEffect(() => {
    const wrapper = scene.current;
    const layer = light.current;
    if (!wrapper || !layer) return;
    const resize = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      const scale = Math.max(width / 2172, height / 724);
      const align = window.innerWidth <= 700 ? .75 : 1;
      layer.style.transform = `translate(${(width - 2172 * scale) * align}px, ${(height - 724 * scale) / 2}px) scale(${scale})`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    resize();
    return () => observer.disconnect();
  }, []);
  return <div className="hero-woodland" ref={scene} aria-hidden="true">
    <SeasonalImage className="hero-landscape" src="/hijgend-hert-woodland.webp" winterSrc="/hijgend-hert-woodland-winter.webp" alt="" width="2172" height="724" fetchPriority="high"/>
    <div className="woodland-firelight" ref={light}><i className="firelight-near"/><i className="firelight-middle"/><i className="firelight-far"/></div>
  </div>;
}

export function BreathingCrest() {
  const crest = useRef<HTMLDivElement>(null);
  const id = useId().replaceAll(":", "");
  useAmbientVisibility(crest);
  return <div className="hero-crest" ref={crest}>
    <img className="hero-logo" src="/clan-logo.png" alt="Hijgend Hert — hert met kroon en zwart-gouden clanbanieren" fetchPriority="high" width="1254" height="1254"/>
    <AntlerLights/>
    <svg className="stag-eye" viewBox="0 0 1254 1254" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fur`} x1="0" y1="0" x2="0.3" y2="1"><stop stopColor="#e99135"/><stop offset=".5" stopColor="#b85b1d"/><stop offset="1" stopColor="#70310f"/></linearGradient>
        <clipPath id={`${id}-eye`}><path d="M610 300 L622 290 Q637 289 655 304 Q632 320 610 300Z"/></clipPath>
      </defs>
      <g clipPath={`url(#${id}-eye)`}>
        <g className="stag-eyelid">
          <path fill={`url(#${id}-fur)`} d="M605 286 H660 V321 H605Z"/>
          <path fill="#cf7024" d="m610 290 20 6 25-5-16 13-17-3Z"/>
          <path d="M610 301 Q630 316 655 304" fill="none" stroke="#2b170b" strokeWidth="3"/>
        </g>
      </g>
    </svg>
    <span className="stag-breath" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
  </div>;
}
