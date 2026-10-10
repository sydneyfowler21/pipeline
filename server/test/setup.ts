process.env.TZ = 'UTC';
process.env.DATABASE_URL ??= 'postgres://pipeline:pipeline@127.0.0.1:5432/pipeline';
process.env.SESSION_SECRET ??= 'test-session-secret-32-characters-min';
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-32-characters!!';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.NODE_ENV ??= 'test';
process.env.MAIL_TRANSPORT ??= 'memory';
