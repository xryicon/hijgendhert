import type { Metadata } from 'next';
import ClanSite from '@/components/clan-site';
import '../clan/clan-page.css';
export const metadata: Metadata = { title: 'Leden | Hijgend Hert' };
export default function Page() { return <ClanSite view="clan"/>; }
