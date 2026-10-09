import type { Env } from '../env.js';

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
};

export interface MailTransport {
  send(message: OutboundMail): Promise<void>;
}

export class MemoryMailTransport implements MailTransport {
  readonly messages: OutboundMail[] = [];

  async send(message: OutboundMail): Promise<void> {
    this.messages.push(message);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

/**
 * Dev mailbox. The message body is the one-time link, so this transport prints it.
 * Production refuses to start on this transport (see resolveMailTransport).
 */
export class ConsoleMailTransport extends MemoryMailTransport {
  override async send(message: OutboundMail): Promise<void> {
    await super.send(message);
    console.info(`[mail] to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}

export class ResendMailTransport implements MailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: OutboundMail): Promise<void> {
    const response = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      console.error(`Resend send failed with status ${response.status}`);
      throw new Error('Email delivery failed');
    }
  }
}

export function createMailTransport(env: Env): MailTransport {
  if (env.MAIL_TRANSPORT === 'memory') return new MemoryMailTransport();
  if (env.MAIL_TRANSPORT === 'console') return new ConsoleMailTransport();
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required when MAIL_TRANSPORT=resend');
  return new ResendMailTransport(env.RESEND_API_KEY, env.MAIL_FROM);
}

export function verifyEmail(appUrl: string, token: string): { subject: string; text: string } {
  return {
    subject: 'Verify your email',
    text: `Confirm your email for pipeline:\n\n${appUrl}/verify-email?token=${token}\n\nThis link expires in 24 hours.\n`,
  };
}

export function resetEmail(appUrl: string, token: string): { subject: string; text: string } {
  return {
    subject: 'Reset your password',
    text: `Reset your pipeline password:\n\n${appUrl}/reset-password?token=${token}\n\nThis link expires in 30 minutes and works once.\n`,
  };
}

export function existingAccountEmail(appUrl: string): { subject: string; text: string } {
  return {
    subject: 'Sign in to pipeline',
    text: `An account for this email already exists.\n\nIf you forgot your password, reset it at ${appUrl}/reset-password\n`,
  };
}
