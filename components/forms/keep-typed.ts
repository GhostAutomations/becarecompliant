"use client";

import { startTransition, useEffect, useRef, type FormEvent, type RefObject } from "react";

/**
 * A REFUSED SAVE NEVER WIPES WHAT WAS TYPED (Phil, 2026-10-01, standing rule for every form).
 *
 * React 19 resets every field of a form whose action was passed to action={} (or a button's
 * formAction={}) as soon as the action finishes, error or not. So a save refused for one missing
 * field emptied the whole form (DEF-091, DEF-098). Submitting through onSubmit instead leaves the
 * form exactly as it was; the action still runs in a transition, so pending and the returned
 * state work as before.
 *
 *   <form onSubmit={submitKeepingTyped(formAction)}>
 *
 * Several actions on one form (Save draft / Save and submit): submitKeepingTypedBy, with a picker
 * that gets the button that was pressed.
 */
type Dispatch = (fd: FormData) => void;

function formDataOf(e: FormEvent<HTMLFormElement>): { fd: FormData; submitter: HTMLElement | null } {
  e.preventDefault();
  const submitter = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null) ?? null;
  const fd = submitter ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
  return { fd, submitter };
}

export function submitKeepingTyped(dispatch: Dispatch) {
  return (e: FormEvent<HTMLFormElement>) => {
    const { fd } = formDataOf(e);
    startTransition(() => dispatch(fd));
  };
}

export function submitKeepingTypedBy(pick: (submitter: HTMLElement | null) => Dispatch) {
  return (e: FormEvent<HTMLFormElement>) => {
    const { fd, submitter } = formDataOf(e);
    const dispatch = pick(submitter);
    startTransition(() => dispatch(fd));
  };
}

/**
 * For a form that stays on the page and should empty after a SUCCESS (an "add" form): what React
 * used to do on every finish, now only when the result is a success.
 */
export function useClearOnSuccess<S>(
  formRef: RefObject<HTMLFormElement | null>,
  state: S,
  isSuccess: (s: S) => boolean,
) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (isSuccess(state)) formRef.current?.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
