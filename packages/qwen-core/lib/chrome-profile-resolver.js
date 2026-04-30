import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');

export function getChromeProfiles(userDataDir = CHROME_USER_DATA) {
  const localStatePath = path.join(userDataDir, 'Local State');
  let localState;
  try {
    localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
  } catch {
    return [];
  }

  const infoCache = localState?.profile?.info_cache || {};
  const profiles = [];

  for (const [dir, info] of Object.entries(infoCache)) {
    const profilePath = path.join(userDataDir, dir);
    const exists = fs.existsSync(profilePath);
    profiles.push({
      directory: dir,
      name: info.name || dir,
      path: profilePath,
      exists,
      email: info.user_name || info.gaia_name || '',
      avatar: info.avatar_icon || '',
    });
  }

  return profiles;
}

export function findProfileByName(profiles, name) {
  const normalized = name.toLowerCase().trim();
  return profiles.find((p) =>
    p.name.toLowerCase().includes(normalized) ||
    p.email.toLowerCase().includes(normalized) ||
    p.directory.toLowerCase() === normalized
  );
}

export function resolveChromeProfile(options = {}) {
  const explicitPath = options.chromeProfile || process.env.CHROME_PROFILE || '';
  const explicitDir = options.profileDirectory || process.env.CHROME_PROFILE_DIRECTORY || '';
  const userDataDir = options.userDataDir || CHROME_USER_DATA;

  // 1. Explicit path
  if (explicitPath) {
    const name = path.basename(explicitPath);
    const isValid = /^(Default|Profile\s+\d+)$/u.test(name);
    if (isValid) {
      return {
        userDataDir: path.dirname(explicitPath),
        profileDirectory: name,
        profilePath: explicitPath,
        resolved: true,
      };
    }
    return {
      userDataDir: explicitPath,
      profileDirectory: explicitDir || 'Default',
      profilePath: path.join(explicitPath, explicitDir || 'Default'),
      resolved: Boolean(explicitDir),
    };
  }

  // 2. Explicit directory
  if (explicitDir) {
    return {
      userDataDir,
      profileDirectory: explicitDir,
      profilePath: path.join(userDataDir, explicitDir),
      resolved: true,
    };
  }

  // 3. Auto-detect by profile name
  const profiles = getChromeProfiles(userDataDir);
  const name = (options.profileName || process.env.QWEN_CHROME_PROFILE_NAME || process.env.CHROME_PROFILE_NAME || '').toLowerCase().trim();
  if (name) {
    const match = profiles.find((p) => p.exists && (
      p.name.toLowerCase().includes(name) ||
      p.email.toLowerCase().includes(name)
    ));
    if (match) {
      return {
        userDataDir,
        profileDirectory: match.directory,
        profilePath: match.path,
        profileName: match.name,
        resolved: true,
      };
    }
  }

  // 4. Machine-specific fallback: Profile 147 (zukunftsorientierte, eingeloggt bei Qwen)
  const p147 = profiles.find((p) => p.directory === 'Profile 147' && p.exists);
  if (p147) {
    return {
      userDataDir,
      profileDirectory: p147.directory,
      profilePath: p147.path,
      profileName: p147.name,
      resolved: true,
    };
  }

  return {
    userDataDir,
    profileDirectory: 'Default',
    profilePath: path.join(userDataDir, 'Default'),
    resolved: false,
  };
}
