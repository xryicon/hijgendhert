import type { WeeklyCategory } from '@/lib/community';

const skills = [
  ['woodcutting', 'Woodcutting'], ['fishing', 'Fishing'], ['farming', 'Farming'],
  ['smithing', 'Smithing'], ['ranged', 'Ranged'], ['firemaking', 'Firemaking'],
  ['cooking', 'Cooking'], ['runecraft', 'Runecraft'], ['fletching', 'Fletching'],
  ['hunter', 'Hunter'], ['construction', 'Construction'], ['mining', 'Mining'],
];
const bosses = [
  ['king_black_dragon', 'King Black Dragon'], ['general_graardor', 'General Graardor'],
  ['araxxor', 'Araxxor'], ['zulrah', 'Zulrah'], ['scurrius', 'Scurrius'],
  ['vorkath', 'Vorkath'], ['cerberus', 'Cerberus'], ['alchemical_hydra', 'Alchemical Hydra'],
  ['commander_zilyana', 'Commander Zilyana'], ['kreearra', "Kree'arra"],
  ['kril_tsutsaroth', "K'ril Tsutsaroth"], ['dagannoth_rex', 'Dagannoth Rex'],
];

export default function WeeklyWheelArt({ category }: { category: WeeklyCategory }) {
  const skilling = category === 'skill';
  const icons = skilling ? skills : bosses;
  // Coordinates refer to the 1536 × 1024 artwork, keeping the icons on their wedges.
  const centre = skilling ? [765, 447] : [768, 470];
  const radius = skilling ? 265 : 287;
  const iconSize = skilling ? 92 : 118;
  return <span className={`weekly-wheel-art weekly-wheel-${category}`} role="img" aria-label={skilling ? 'Hertenrad met originele OSRS-skilliconen' : 'Hertenrad met originele OSRS-bossiconen'}>
    <img className="weekly-wheel-background" src={`/hijgend-hert-${skilling ? 'sotw' : 'botw'}-wheel.webp`} alt="" width={1536} height={1024} draggable={false}/>
    {icons.map(([metric, label], index) => {
      const angle = ((skilling ? -75 : -90) + index * 30) * Math.PI / 180;
      const left = (centre[0] + Math.cos(angle) * radius) / 1536 * 100;
      const top = (centre[1] + Math.sin(angle) * radius) / 1024 * 100;
      return <span className="weekly-wheel-icon" key={metric} title={label} style={{ left: `${left.toFixed(4)}%`, top: `${top.toFixed(4)}%`, width: `${iconSize / 1536 * 100}%` }}>
        <img src={`/osrs-icons/${skilling ? 'skills' : 'bosses'}/${metric}.png`} alt="" width={32} height={32} draggable={false}/>
      </span>;
    })}
  </span>;
}
