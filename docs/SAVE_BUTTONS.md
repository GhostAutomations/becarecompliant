# Save and send buttons: the one rule

Every save/submit/send button in Be Care Compliant behaves the same way:

1. On press: shows `Saving…` (or `Working…`) and disables while pending.
2. On success: the button turns **green** and reads **Saved** (or **Sent**), keeping the **exact same button shape**.
3. It **stays green until that section is edited again**, then reverts to the normal gold button. It is a persistent confirmation, not a timed flash.

There is no separate green "Saved" text label. The button itself is the confirmation.

## How to build one (never hand-roll)

**Form saves (the default):** use the shared `components/action-form.tsx`.

```tsx
<ActionForm action={myServerAction} label="Save" />          // save
<ActionForm action={sendThing} label="Send" savedLabel="Sent" /> // send/resend
```

`ActionForm` handles the green state and resets on the form's `onChange`. Do not pass a green className; do not add a separate success `<span>`.

**Bespoke buttons (custom client state):** use `lib/use-saved-flash.ts`.

```tsx
const [saved, flash, reset] = useSavedFlash();
useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);
// ...
<form action={action} onChange={reset}>
  <button className={`${saved ? "btn-saved" : "btn-primary"} ...`}>
    {pending ? "Saving…" : saved ? "Saved" : "Save"}
  </button>
</form>
```

Always wire `onChange={reset}` (or `resetSaved`) on the form/section so editing reverts the button. Multi-row lists give each row its own state (see `PhoneRow` in `notification-settings.tsx`) so only the saved row goes green.

## The rectangle bug (do not reintroduce)

The green state comes from the single class `.btn-saved` in `app/globals.css`. It **must stay inside the shared base-button grouped selector** (alongside `.btn-primary`, `.btn-outline`, …) so it keeps padding/radius/shape. If it is ever removed from that group it collapses into a bare green **rectangle** — the bug that cost hours.

`lib/ui/save-button.test.ts` fails if `.btn-saved` leaves the base group or loses its fill. Run `npm test` before shipping button changes.

## Not save buttons

Terminal, one-shot flow confirmations inside dialogs (e.g. "Meeting booked", "Invitation accepted", a meeting response that replaces the form) may keep a plain green success message — they are end-of-flow states, not save buttons. Destructive actions (Delete, Revoke) use `btn-outline`/`btn-ghost` and never go green.
