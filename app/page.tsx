import ClanSite from "@/components/clan-site";
import { env } from 'cloudflare:workers';
import { loadWelcomeContent } from '@/lib/welcome';

export default async function Home() {
  return <ClanSite view="home" welcome={await loadWelcomeContent(env)}/>;
}
