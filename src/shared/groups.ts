/** Shareable group invite: version, 128-bit secret and the group name. */
export const GROUP_INVITE =
  /^DJG1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{1,172})$/u;
/** Groups kept in one app. */
export const MAX_LOCAL_GROUPS = 8;
export const GROUP_NAME_MAX = 32;
