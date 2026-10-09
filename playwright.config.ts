import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build -w client && npm run start -w server`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://pipeline:pipeline@127.0.0.1:5432/pipeline',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-session-secret-32-characters-min',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'test-encryption-key-32-characters!!',
      APP_URL: baseURL,
      NODE_ENV: 'test',
      MAIL_TRANSPORT: 'memory',
      PORT: String(port),
    },
  },
  projects: [
    {
      name: 'journey',
      testMatch: /journey\.spec\.ts/,
      use: { video: 'on', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'quality',
      testMatch: /quality\.spec\.ts/,
      use: { video: 'off' },
    },
  ],
});
