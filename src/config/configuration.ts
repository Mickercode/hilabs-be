export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  webOrigin: string;
  anthropicApiKey: string;
}

export default (): { app: AppConfig } => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },
});
