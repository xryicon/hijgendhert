import { Shield } from 'lucide-react';
import { rankLabel, rankSymbol } from '@/lib/osrs-ranks';

export default function RankIcon({ rank, size = 20, className = '', decorative = true }: {
  rank?: string; size?: number; className?: string; decorative?: boolean;
}) {
  const symbol = rankSymbol(rank);
  const accessibility = {
    'aria-hidden': decorative || undefined,
    'aria-label': decorative ? undefined : `Clanrang: ${rankLabel(rank)}`,
    role: decorative ? undefined : 'img' as const,
    focusable: false as const,
  };
  if (!symbol) return <Shield className={`rank-icon rank-icon-fallback ${className}`.trim()} size={size} {...accessibility}/>;
  return <svg className={`rank-icon rank-icon-image ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" {...accessibility}>
    <use href={`/osrs-icons/clan-ranks.svg${symbol}`}/>
  </svg>;
}
