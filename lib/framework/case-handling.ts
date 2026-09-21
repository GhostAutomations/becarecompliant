/**
 * Be Care Compliant — how well complaints and incidents are HANDLED, for readiness.
 *
 * Phil, 2026-09-19: complaints and incidents counted towards no theme at all, so a complaint
 * answered late or an incident never notified moved nothing. They now feed the regulator themes
 * (CIW: complaints under Leadership and Management, incidents under Well-being; CQC: Responsive
 * and Safe).
 *
 * WHAT IS MEASURED IS THE HANDLING, NEVER THE NUMBER. Recording a complaint or an incident is good
 * practice; counting them would punish the service that writes things down. So each case is a set
 * of DEADLINES, and a deadline is either met, missed, or still running:
 *   complaint  acknowledgement_due vs date_acknowledged, response_due vs date_closed
 *   incident   investigation due 14 days after it was reported (Phil's choice),
 *              outcome due 14 days after the investigation unless No further action,
 *              and, with no date to run against, a notifiable incident with no notification
 *              recorded or a safeguarding one with no referral recorded is outstanding now.
 *
 * Pure and importless, so it is unit tested.
 */

export const INCIDENT_STAGE_DAYS = 14;

export type ComplaintRow = {
  status: string;
  acknowledgement_due: string | null;
  date_acknowledged: string | null;
  response_due: string | null;
  date_closed: string | null;
};

export type IncidentRow = {
  status: string;
  reported_on: string | null;
  occurred_on: string;
  investigation_completed: string | null;
  no_further_action: boolean | null;
  outcome_recorded_on: string | null;
  closed_on: string | null;
  notifiable: boolean;
  notified_on: string | null;
  safeguarding: boolean;
  safeguarding_referred_on: string | null;
};

export type Handling = {
  /** Deadlines already passed with nothing done, plus undated gaps (notification, referral). */
  overdue: number;
  /** Deadlines that fell due in the window and have passed: how many, and how many were met. */
  due: number;
  onTime: number;
};

type Deadline = { due: string | null; done: string | null };

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function tally(deadlines: Deadline[], today: string, from: string): Handling {
  const out: Handling = { overdue: 0, due: 0, onTime: 0 };
  for (const d of deadlines) {
    if (!d.due) continue;
    if (!d.done && d.due < today) out.overdue += 1;
    // Graded once it has passed, or once it was done, whichever is first; only in the window.
    const graded = d.done !== null || d.due < today;
    if (!graded || d.due < from || d.due > today) continue;
    out.due += 1;
    if (d.done !== null && d.done <= d.due) out.onTime += 1;
  }
  return out;
}

function add(a: Handling, b: Handling): Handling {
  return { overdue: a.overdue + b.overdue, due: a.due + b.due, onTime: a.onTime + b.onTime };
}

/** Complaints: acknowledged and answered by their due dates. A withdrawn one asks nothing. */
export function complaintHandling(rows: ComplaintRow[], today: string, from: string): Handling {
  let out: Handling = { overdue: 0, due: 0, onTime: 0 };
  for (const c of rows) {
    if (c.status === "withdrawn") continue;
    out = add(
      out,
      tally(
        [
          { due: c.acknowledgement_due, done: c.date_acknowledged },
          { due: c.response_due, done: c.date_closed },
        ],
        today,
        from,
      ),
    );
  }
  return out;
}

/** Incidents: investigated and answered in time, and told to whoever had to be told. */
export function incidentHandling(rows: IncidentRow[], today: string, from: string): Handling {
  let out: Handling = { overdue: 0, due: 0, onTime: 0 };
  for (const i of rows) {
    const reported = i.reported_on ?? i.occurred_on;
    const deadlines: Deadline[] = [
      // A case closed without the form stages (an older record) is not chased for them.
      { due: addDays(reported, INCIDENT_STAGE_DAYS), done: i.investigation_completed ?? i.closed_on },
    ];
    if (i.investigation_completed && i.no_further_action !== true) {
      deadlines.push({
        due: addDays(i.investigation_completed, INCIDENT_STAGE_DAYS),
        done: i.outcome_recorded_on ?? i.closed_on,
      });
    }
    out = add(out, tally(deadlines, today, from));
    if (i.notifiable && !i.notified_on) out.overdue += 1;
    if (i.safeguarding && !i.safeguarding_referred_on) out.overdue += 1;
  }
  return out;
}

export function handlingPct(h: Handling): number | null {
  return h.due > 0 ? Math.floor((100 * h.onTime) / h.due) : null;
}
