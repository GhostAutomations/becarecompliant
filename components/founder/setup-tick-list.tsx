"use client";

/**
 * Be Care Compliant — the creation tick list on Founder > Create a company (Phil, 2026-09-26).
 *
 * Everything starts ticked: Thistle's set up is the default. Untick what this customer will not
 * use. A check takes its form and its register columns with it. Locked rows cannot be unticked
 * and say why. Only ticked boxes are sent, so `setup_list_shown` tells the server the list was
 * really on the screen (lib/setup/defaults.ts skippedKeys), and a list that failed to draw
 * leaves nothing out.
 */

import { useState } from "react";
import SettingsSection from "@/components/settings/settings-section";
import type { SetupCatalogue, SetupCheck } from "@/lib/setup/defaults";

function CheckRows({
  rows,
  kept,
  toggle,
  field,
}: {
  rows: SetupCheck[];
  kept: Set<string>;
  toggle: (key: string) => void;
  field: string;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((c) => {
        const locked = Boolean(c.lockedReason);
        const on = locked || kept.has(c.key);
        return (
          <li key={c.key}>
            <label className={`flex items-start gap-2.5 text-sm ${locked ? "cursor-default" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                name={locked ? undefined : field}
                value={c.key}
                checked={on}
                disabled={locked}
                onChange={() => toggle(c.key)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className={on ? "text-white/90" : "text-white/45 line-through"}>{c.name}</span>
                {c.formName && c.formName !== c.name ? (
                  <span className="text-white/45">, form: {c.formName}</span>
                ) : null}
                <span className="block text-xs text-white/50">
                  {c.adHoc
                    ? "Completed when needed, so no register column."
                    : c.columns.length
                      ? `Columns: ${c.columns.join(", ")}`
                      : null}
                </span>
                {locked ? <span className="block text-xs text-gold-300/80">Always included. {c.lockedReason}</span> : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function SetupTickList({ catalogue }: { catalogue: SetupCatalogue }) {
  const people = catalogue.checks.filter((c) => c.population === "people");
  const su = catalogue.checks.filter((c) => c.population === "service_users");

  const [keptPeople, setKeptPeople] = useState(() => new Set(people.map((c) => c.key)));
  const [keptSu, setKeptSu] = useState(() => new Set(su.map((c) => c.key)));
  const [keptCourses, setKeptCourses] = useState(() => new Set(catalogue.courses.map((c) => c.id)));

  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const count = (rows: SetupCheck[], kept: Set<string>) =>
    `${rows.filter((r) => r.lockedReason || kept.has(r.key)).length} of ${rows.length}`;

  return (
    <div className="space-y-3">
      <input type="hidden" name="setup_list_shown" value="1" />
      <div>
        <p className="text-sm font-semibold text-white/90">What they start with</p>
        <p className="form-hint">
          Everything is ticked: this is Thistle&rsquo;s set up. Untick what this customer won&rsquo;t
          use. A check brings its form and its register columns with it. If they bring their own
          forms, rename the columns on the company page afterwards to match.
        </p>
      </div>

      <SettingsSection title="People checks" count={count(people, keptPeople)}>
        <CheckRows rows={people} kept={keptPeople} field="keep_people_check" toggle={(k) => setKeptPeople((s) => flip(s, k))} />
      </SettingsSection>

      <SettingsSection title="Service User checks" count={count(su, keptSu)}>
        <CheckRows rows={su} kept={keptSu} field="keep_su_check" toggle={(k) => setKeptSu((s) => flip(s, k))} />
      </SettingsSection>

      <SettingsSection
        title="Training courses"
        count={`${keptCourses.size} of ${catalogue.courses.length}`}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-outline px-3 py-1.5 text-xs"
            onClick={() => setKeptCourses(new Set(catalogue.courses.map((c) => c.id)))}
          >
            Tick all
          </button>
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setKeptCourses(new Set())}>
            Untick all
          </button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {catalogue.courses.map((c) => {
            const on = keptCourses.has(c.id);
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name="keep_course"
                    value={c.id}
                    checked={on}
                    onChange={() => setKeptCourses((s) => flip(s, c.id))}
                    className="mt-0.5"
                  />
                  <span className={on ? "text-white/90" : "text-white/45 line-through"}>
                    {c.name}
                    {c.mandatory ? <span className="ml-1 text-xs text-white/45">(mandatory)</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <SettingsSection title="Forms always included" count={catalogue.lockedForms.length}>
        <ul className="space-y-2.5">
          {catalogue.lockedForms.map((f) => (
            <li key={f.key} className="text-sm">
              <span className="text-white/90">{f.name}</span>
              <span className="block text-xs text-white/50">
                {f.lockedReason}
                {f.columns.length ? ` Columns: ${f.columns.join(", ")}.` : ""}
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
