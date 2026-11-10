import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { discordAuthRoute, privateHeaders } from "../lib/discord-auth";
import { memberProfileRoute } from "../lib/member-profile";
import { raffleRoute } from "../lib/raffle-route";
import { profileProgressRoute } from "../lib/profile-progress-route";
import { clanMemberRoute } from "../lib/clan-member-route";
import { siteAccessRoute } from "../lib/site-access";
import { notificationRoute } from "../lib/notification-route";
import { clanDiscordRoute } from '../lib/clan-discord-route';
export { ClanDiscord } from './clan-discord';
import { eventLeaderboardRoute } from '../lib/event-leaderboard-route';
export { ClanRaffle } from './clan-raffle';
export { ClanProgress } from './clan-progress';
export { WomCache } from './wom-cache';
export { SiteAccessLimits } from './site-access';

const application = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const assetPath = new URL(request.url).pathname;
    if (env.ASSETS && ['GET', 'HEAD'].includes(request.method) && !assetPath.startsWith('/api/') && /\.(?:js|mjs|css|png|webp|jpg|jpeg|svg|ico|woff2?|ttf|map|html)$/i.test(assetPath)) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      await asset.body?.cancel();
    }
    const memberResponse = await clanMemberRoute(request, env);
    if (memberResponse) return memberResponse;
    const syncResponse = await clanDiscordRoute(request, env);
    if (syncResponse) return syncResponse;
    const leaderboardResponse = await eventLeaderboardRoute(request, env);
    if (leaderboardResponse) return leaderboardResponse;
    const raffleResponse = await raffleRoute(request, env);
    if (raffleResponse) return raffleResponse;
    const authResponse = await discordAuthRoute(request, env);
    if (authResponse) return authResponse;
    const notificationResponse = await notificationRoute(request, env);
    if (notificationResponse) return notificationResponse;
    const progressResponse = await profileProgressRoute(request, env);
    if (progressResponse) return progressResponse;
    const profileResponse = await memberProfileRoute(request, env);
    if (profileResponse) return profileResponse;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    const path = new URL(request.url).pathname;
    if (path.startsWith('/beheer/') || path.startsWith('/api/admin/') || path === '/login' || path === '/profiel' || path.startsWith('/profiel/') || path === '/ledenomgeving' || path.startsWith('/ledenomgeving/') || path.startsWith('/api/auth/') || path.startsWith('/api/members/')) {
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
      // Native same-origin forms need a non-null Origin for CSRF validation.
      // Auth redirects retain no-referrer; these pages reveal no referrer off-site.
      if (!path.startsWith('/api/')) headers.set('Referrer-Policy', 'same-origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  },
};

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const access = await siteAccessRoute(request, env);
    if (access) return access;
    const response = await application.fetch(request, env, ctx);
    if (env.SITE_MAINTENANCE_MODE === 'off') return response;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.append('Vary', 'Cookie');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
