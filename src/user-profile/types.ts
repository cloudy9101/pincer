export const PROFILE_KEYS = ['name', 'home_location', 'location', 'timezone', 'communication_style'] as const;

export type ProfileKey = typeof PROFILE_KEYS[number];

export type UserProfile = Partial<Record<ProfileKey, string>>;
