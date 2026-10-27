import type { SecretBox } from '../security/secrets';

interface DeviceState { deviceCode: string; expiresAt: number; interval: number }

export interface GitHubAuthOptions {
  clientId: () => string;
  secrets: SecretBox;
  fetchImpl?: typeof fetch;
}

export class GitHubAuth {
  private pending: DeviceState | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GitHubAuthOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async start(): Promise<{ userCode: string; verificationUri: string; expiresIn: number }> {
    const clientId = this.options.clientId();
    if (!clientId) throw new Error('AUTH: GitHub client ID is not configured');
    const response = await this.fetchImpl('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
    });
    if (!response.ok) throw new Error(`AUTH: GitHub device flow failed (${response.status})`);
    const data = (await response.json()) as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };
    this.pending = {
      deviceCode: data.device_code,
      expiresAt: Date.now() + data.expires_in * 1000,
      interval: data.interval,
    };
    return { userCode: data.user_code, verificationUri: data.verification_uri, expiresIn: data.expires_in };
  }

  async poll(): Promise<{ status: 'pending' | 'connected' | 'expired'; login?: string }> {
    if (!this.pending) throw new Error('AUTH: no device flow in progress');
    if (Date.now() > this.pending.expiresAt) {
      this.pending = null;
      return { status: 'expired' };
    }
    const clientId = this.options.clientId();
    const response = await this.fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: this.pending.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = (await response.json()) as { access_token?: string; error?: string };
    if (data.error === 'authorization_pending') return { status: 'pending' };
    if (data.error === 'slow_down') {
      this.pending.interval += 5;
      return { status: 'pending' };
    }
    if (data.error) {
      this.pending = null;
      return { status: 'expired' };
    }
    if (!data.access_token) throw new Error('AUTH: GitHub did not return a token');
    this.options.secrets.set('secret:github', data.access_token);
    this.pending = null;

    const user = await this.fetchImpl('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'r3x-agent-studio',
      },
    });
    const login = user.ok ? String(((await user.json()) as { login?: string }).login ?? '') : undefined;
    return { status: 'connected', login };
  }

  getToken(): string {
    const token = this.options.secrets.get('secret:github');
    if (!token) throw new Error('AUTH: GitHub is not connected');
    return token;
  }

  hasToken(): boolean {
    return this.options.secrets.has('secret:github');
  }

  disconnect(): void {
    this.options.secrets.clear('secret:github');
  }
}
