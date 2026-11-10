'use client';
import type { ImgHTMLAttributes } from 'react';
import { useSiteAppearance } from './site-appearance-provider';

// Server rendering and live updates use the same shared appearance setting.
export default function SeasonalImage({ src, winterSrc, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string; winterSrc: string }) {
  const { appearance } = useSiteAppearance();
  return <img {...props} src={appearance.christmasEnabled ? winterSrc : src}/>;
}
