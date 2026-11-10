import { ANTLER_LIGHTS } from '@/lib/christmas-decoration';

export function AntlerLights() {
  return <span className="antler-lights" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ANTLER_LIGHTS }}/>;
}

export default function ClanCrest({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return <i className={`clan-crest ${className}`}><img src="/clan-logo.png" alt={alt} width={1254} height={1254}/><AntlerLights/></i>;
}
