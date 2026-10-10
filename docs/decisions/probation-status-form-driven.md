# Probation status form driven

> Probation status is form-driven only, never an inline dropdown, everywhere

Standing rule (Phil, 2026-07-18): probation status is NEVER edited via an inline dropdown/Save. It is set only by completing the Probation Review form, which then feeds the register/matrix.

**Why:** the compliance loop is the source of truth; inline edits bypass the evidence trail and let the matrix drift from reality.

**How to apply:** show probation status as a READ-ONLY coloured pill (passed=green, failed=red, extended=amber, due/none=neutral) on the People register matrix AND the record drill-down (both the wide above-Checks tile and the compact tracker-row tile). The only way to change it is the Record button → Probation Review form. This overrides the earlier "Matrix only" answer, which kept the drill-down dropdown. See [permission-boundaries](permission-boundaries.md).
