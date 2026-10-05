/** The registers that remember their branch (migration 0385). PURE, importable from the client. */
export const REGISTER_SCREENS = ["people", "training", "service_users"] as const;
export type RegisterScreen = (typeof REGISTER_SCREENS)[number];
