import { createSecretClient } from './lib/secret-client.js';

export const SECRET_SCHEMA = {
  CHROME_PROFILE: { required: true, purpose: 'Chrome profile path for authenticated browser sessions' },
  CHROME_PROFILE_DIRECTORY: { required: false, purpose: 'Explicit Chrome profile name when CHROME_PROFILE points at user-data root' },
  CHROME_PROFILE_NAME: { required: false, purpose: 'Auto-detect Chrome profile by display name (e.g. \"zukunftsorientierte-energie.de\")' },
  QWEN_CHROME_PROFILE_NAME: { required: false, purpose: 'Alias for CHROME_PROFILE_NAME — auto-detect by name' },
  CHROME_CDP_URL: { required: false, purpose: 'Attach to already-running Chrome debug endpoint' },
  CHROME_REMOTE_DEBUGGING_PORT: { required: false, purpose: 'Shorthand for local CDP endpoint port' },
  QWEN_URL: { required: false, purpose: 'Qwen chat URL override (default: https://chat.qwen.ai)' },
  QWEN_AUTH_METHOD: { required: false, purpose: 'Auth method — locked to email_password by runtime validation' },
  QWEN_ACCOUNT_ORDER: { required: false, purpose: 'Preferred account order for fallback login rotation' },
  QWEN_ACCOUNT_STATE_FILE: { required: false, purpose: 'Non-secret cooldown state file for account rotation' },
  QWEN_ACCOUNT_1_EMAIL: { required: true, purpose: 'Qwen direct login email for account 1' },
  QWEN_ACCOUNT_1_PASSWORD: { required: true, purpose: 'Qwen direct login password for account 1' },
  QWEN_ACCOUNT_2_EMAIL: { required: false, purpose: 'Qwen direct login email for account 2' },
  QWEN_ACCOUNT_2_PASSWORD: { required: false, purpose: 'Qwen direct login password for account 2' },
  QWEN_ACCOUNT_3_EMAIL: { required: false, purpose: 'Qwen direct login email for account 3' },
  QWEN_ACCOUNT_3_PASSWORD: { required: false, purpose: 'Qwen direct login password for account 3' },
  SIN_CODER_QWEN_LOG_FILE: { required: false, purpose: 'JSONL log destination path' },
  SIN_CODER_QWEN_ARTIFACT_DIR: { required: false, purpose: 'Screenshot and artifact output directory' },
  INFISICAL_ENV_NAME: { required: false, purpose: 'Infisical environment slug for sync commands' },
  INFISICAL_SECRET_PATH: { required: false, purpose: 'Infisical folder path for sync commands' },
  INFISICAL_PROJECT_ID: { required: false, purpose: 'Infisical project ID for non-interactive pull/push' },
  GH_TOKEN: { required: false, purpose: 'GitHub token for gist publishing and merge operations' },
};

let _defaultClient = null;

export function getSecretClient(options = {}) {
  if (!_defaultClient || options.reset) {
    _defaultClient = createSecretClient(SECRET_SCHEMA, options);
  }
  return _defaultClient;
}

export function hasQwenCredentials(client = getSecretClient()) {
  return client.has('QWEN_ACCOUNT_1_EMAIL') && client.has('QWEN_ACCOUNT_1_PASSWORD');
}
