/**
 * Be Care Compliant — public forms on/off.
 *
 * HIDDEN by Phil's decision (2026-07-26): Team Members are getting their own
 * logins instead, so the public no-account link is not the way in for now.
 * Nothing is deleted. The tables, the RPCs, the queue and the page all stay
 * exactly as built, so switching this to true brings the whole feature back with
 * no migration and no rebuild.
 *
 * While it is false:
 *  - Settings > Public forms is hidden and the page redirects,
 *  - People > Submissions is hidden from the nav and the page redirects,
 *  - the dashboard "Submissions to link" card is hidden,
 *  - /f/<code> shows the neutral "not available" message,
 *  - the public submit path refuses, so there is no unattended write path open
 *    on a feature nobody is using.
 *
 * Same pattern as CUSTOM_COLUMNS_ENABLED on the register columns.
 */
export const PUBLIC_FORMS_ENABLED = false;
