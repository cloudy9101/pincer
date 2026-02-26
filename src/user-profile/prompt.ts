import type { UserProfile } from './types.ts';

/**
 * Format the user profile as a system prompt section.
 * Returns null if the profile has no name (unboarded user).
 */
export function formatProfileSection(profile: UserProfile, now: number): string | null {
  if (!profile.name || profile.name === '(skipped)') return null;

  const lines: string[] = [];

  lines.push(`- Name: ${profile.name}`);

  // Location — show home + current if traveling, otherwise just location
  const home = profile.home_location;
  const current = profile.location;

  if (home && current && home !== current) {
    lines.push(`- Home: ${home}`);
    const timeStr = formatLocalTime(profile.timezone, now);
    lines.push(`- Currently in: ${current}${timeStr ? ` (local time: ${timeStr})` : ''}`);
  } else {
    const loc = current ?? home;
    if (loc) {
      const timeStr = formatLocalTime(profile.timezone, now);
      lines.push(`- Location: ${loc}${timeStr ? ` (local time: ${timeStr})` : ''}`);
    }
  }

  if (profile.communication_style) {
    lines.push(`- Communication style: ${profile.communication_style}`);
  }

  return `\n\n## About ${profile.name}\n${lines.join('\n')}`;
}

function formatLocalTime(timezone: string | undefined, now: number): string | null {
  if (!timezone) return null;
  try {
    return new Date(now).toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      weekday: 'long',
      hour12: true,
    });
  } catch {
    return null;
  }
}
