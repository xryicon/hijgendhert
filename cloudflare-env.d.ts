declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BINGO_ADMIN_EMAIL?: string;
    APP_ORIGIN?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    DISCORD_GUILD_ID?: string;
    DISCORD_MEMBER_ROLE_IDS?: string;
    DISCORD_PUBLIC_KEY?: string;
    DISCORD_SESSION_SECRET?: string;
    WOM_API_KEY?: string;
    WOM_AUTH_MODE?: string;
    RAFFLES?: DurableObjectNamespace<import('./worker/clan-raffle').ClanRaffle>;
  }
}
