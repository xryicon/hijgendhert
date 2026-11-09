import type { Metadata } from 'next';
import BingoHub from '@/components/bingo-hub';
import { notFound } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { bingoIdentity, publicBingoWhere } from '@/lib/bingo-access';
import './bingo.css';

export const metadata: Metadata = { title: 'Clanbingo | Hijgend Hert', description: 'Twee teams, 25 doelen en één gedeeld klassement. Volg de clanbingo van Hijgend Hert.' };
export const dynamic = 'force-dynamic';
export default async function BingoPage() {
  const { canManage } = await bingoIdentity();
  if (!canManage) {
    const live = env.DB && await env.DB.prepare(`SELECT id FROM bingo_events WHERE ${publicBingoWhere} LIMIT 1`).bind(new Date().toISOString()).first();
    if (!live) notFound();
  }
  return <BingoHub/>;
}
