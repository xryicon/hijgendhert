"use client";

import { useState, type ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { metricImage, metricLabel } from '@/lib/osrs-metrics';

export default function MetricImage({ metric, size = 32, className = '', decorative = true, fallback }: {
  metric?: string; size?: number; className?: string; decorative?: boolean; fallback?: ReactNode;
}) {
  const src = metricImage(metric);
  const [failed, setFailed] = useState<string | null>(null);
  const available = src && failed !== src;
  return <span className={`metric-image ${available ? 'has-metric-image' : 'metric-image-fallback'} ${className}`.trim()} style={{ width: size, height: size }} aria-hidden={decorative || undefined}>
    {available ? <img src={src} alt={decorative ? '' : metricLabel(metric || '')} width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(src)}/> : fallback ?? <Trophy size={Math.min(size, 24)} aria-label={decorative ? undefined : 'Clancompetitie'}/>}
  </span>;
}
