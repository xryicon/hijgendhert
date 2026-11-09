declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BINGO_ADMIN_EMAIL?: string;
  }
}
