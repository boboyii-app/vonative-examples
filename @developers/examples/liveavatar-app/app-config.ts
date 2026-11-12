export interface AppConfig {
  pageTitle: string;
  pageDescription: string;
  companyName: string;

  supportsChatInput: boolean;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  isPreConnectBufferEnabled: boolean;

  logo: string;
  startButtonText: string;
  accent?: string;
  logoDark?: string;
  accentDark?: string;

  // agent dispatch configuration
  agentName?: string;

  // Vonative Sandbox configuration
  sandboxId?: string;
}

export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: 'Vonative',
  pageTitle: 'Vonative | AI Intake Assistant',
  pageDescription: 'AI-powered healthcare intake assistant, powered by Vonative',

  supportsChatInput: false,
  supportsVideoInput: false,
  supportsScreenShare: false,
  isPreConnectBufferEnabled: true,

  logo: '/livecare-logo-light.svg',
  accent: '#F97316',
  logoDark: '/livecare-logo-dark.svg',
  accentDark: '#FB923C',
  startButtonText: 'Start intake',

  // agent dispatch configuration
  agentName: process.env.AGENT_NAME ?? 'Vonative-Demo',

  // Vonative Sandbox configuration
  sandboxId: undefined,
};
