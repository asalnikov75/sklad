// Role rules shared by the db layer and the session layer (pure, no Next.js imports).

/** Emails listed in ADMIN_EMAILS (comma separated) are always Super Admins while the variable is set. */
export function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** True if the stored flag is set OR the account's email is in ADMIN_EMAILS. */
export function isEffectiveAdmin(user) {
  return !!user && (user.is_admin === true || adminEmails().includes(String(user.email || '').toLowerCase()));
}

/** True when admin rights come only from ADMIN_EMAILS (cannot be removed from the UI). */
export const adminViaEnv = (user) => !!user && user.is_admin !== true && isEffectiveAdmin(user);
