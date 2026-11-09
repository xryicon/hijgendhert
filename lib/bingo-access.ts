import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export async function bingoIdentity() {
  const user = await getChatGPTUser();
  const configured = env.BINGO_ADMIN_EMAIL?.trim().toLowerCase();
  return { user, canManage: !!(user && configured && user.email.trim().toLowerCase() === configured) };
}
export const publicBingoWhere = "visibility = 'public' AND status = 'active' AND starts_at <= ?1 AND ends_at > ?1";
