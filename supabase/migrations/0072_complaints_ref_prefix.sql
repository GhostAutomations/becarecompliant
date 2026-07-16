-- 0072_complaints_ref_prefix
-- Company-specific complaint reference prefix. The complaint reference is displayed as
-- {prefix}{DD}{MM}{number}, e.g. TC15071. If null, the prefix is derived from the
-- company name initials. Applied to ref bgrtcvyjuwopunpnudeu only.

alter table public.complaints_config
  add column if not exists ref_prefix text;
