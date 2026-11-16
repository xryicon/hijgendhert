import type { Metadata } from 'next';
import SiteHeader from '@/components/site-header';
import WarshipDashboard from '@/components/warship-dashboard';
import '../warships.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Zeeslag Bingo | Hijgend Hert', robots: { index: false, follow: false } };
export default function Page() { return <><SiteHeader view="events"/><WarshipDashboard/></>; }
