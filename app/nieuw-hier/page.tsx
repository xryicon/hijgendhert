import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import { loadWelcomeContent } from '@/lib/welcome';
import WelcomePage from '@/components/welcome-page';

export const metadata: Metadata = { title: 'Nieuw hier? | Hijgend Hert', description: 'Maak kennis met Hijgend Hert. Lees hoe je lid wordt, ontdek beginnersvriendelijke clanactiviteiten en begin je volgende avontuur met ons.' };
export default async function Page() { return <WelcomePage content={await loadWelcomeContent(env)}/>; }
