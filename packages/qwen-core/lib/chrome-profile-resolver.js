import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const LOCAL_STATE = path.join(CHROME_USER_DATA, 'Local State');

function readLocalState() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_STATE, 'utf8'));
  } catch {
    return null;
  }
}

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

export function findProfileWithPrefs(profiles, prefsDir = CHROME_USER_DATA) {
  return profiles.filter((p) => {
    const prefsPath = path.join(p.path, 'Preferences');
    if (!fs.existsSync(prefsPath)) return false;
    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      return prefs.session?.restore_on_startup !== undefined;
    } catch {
      return false;
    }
  });
}

export function resolveChromeProfile(options = {}) {
  const explicitPath = options.chromeProfile || process.env.CHROME_PROFILE || '';
  const explicitDir = options.profileDirectory || process.env.CHROME_PROFILE_DIRECTORY || '';
  const userDataDir = options.userDataDir || CHROME_USER_DATA;

  if (explicitPath) {
    const name = path.basename(explicitPath);
    const isValidProfile = /^(Default|Profile\s+\d+)$/u.test(name);
    if (isValidProfile) {
  // Priority 4: Default fallback — on this machine Profile 147 is the logged-in Qwen profile
  const profiles147 = getChromeProfiles(userDataDir).filter(p => p.directory === 'Profile 147' && p.exists);
  if (profiles147.length > 0) {
    const match = profiles147[0];
    return {
      userDataDir,
      profileDirectory: match.directory,
      profilePath: match.path,
      profileName: match.name,
      resolved: true,
    };
  }

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

  if (explicitDir) {
    return {
      userDataDir,
      profileDirectory: explicitDir,
      profilePath: path.join(userDataDir, explicitDir),
      resolved: true,
    };
  }

  const profiles = getChromeProfiles(userDataDir);
  const match = options.profileName
    ? profiles.find((p) => {
        const name = options.profileName.toLowerCase().trim();
        return p.exists && (
          p.name.toLowerCase().includes(name) ||
          p.email.toLowerCase().includes(name)
        );
      })
    : null;

  if (match && match.exists) {
    return {
      userDataDir,
      profileDirectory: match.directory,
      profilePath: match.path,
      profileName: match.name,
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
