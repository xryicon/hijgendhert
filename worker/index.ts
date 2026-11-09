import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { discordAuthRoute, privateHeaders } from "../lib/discord-auth";
import { memberProfileRoute } from "../lib/member-profile";
import { raffleRoute } from "../lib/raffle-route";
export { ClanRaffle } from './clan-raffle';
export { WomCache } from './wom-cache';

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const raffleResponse = await raffleRoute(request, env);
    if (raffleResponse) return raffleResponse;
    const authResponse = await discordAuthRoute(request, env);
    if (authResponse) return authResponse;
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
    if (path === '/login' || path === '/profiel' || path.startsWith('/profiel/') || path === '/ledenomgeving' || path.startsWith('/ledenomgeving/') || path.startsWith('/api/auth/') || path.startsWith('/api/members/')) {
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

export default worker;
