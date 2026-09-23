export type LoginState = {
  error: string | null;
};

export const LOGIN_REASON_MESSAGES: Record<string, string> = {
  "signed-out-elsewhere":
    "You've been signed out because your account was signed in elsewhere.",
  "no-access":
    "Your account does not have access. Contact your administrator.",
  "password-changed":
    "Your password has been changed, and you have been signed out everywhere. Sign in with your new password.",
};
