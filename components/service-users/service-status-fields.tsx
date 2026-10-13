"use client";

/**
 * The Service status choice, and, when someone comes back to Active from hospital or respite, the
 * date they did (Phil, 2026-10-13: "When it is moved from the hospital view into the main compliance
 * view ask for a date they came out of hospital"; 0462 the same for respite). Their paused checks
 * fall due 7 days after that date. A move straight between hospital and respite asks nothing: the
 * pause carries on.
 */

import { useState } from "react";
import { SERVICE_STATUS_LABELS, type ServiceStatus } from "@/lib/service-users/types";
import { isAway, returnQuestion } from "@/lib/service-users/hospital-pause";

export default function ServiceStatusFields({
  current,
  hospitalSince,
  todayIso,
}: {
  current: ServiceStatus;
  hospitalSince: string | null;
  todayIso: string;
}) {
  const [status, setStatus] = useState<ServiceStatus>(current);
  const comingBack = isAway(current) && status === "active";
  return (
    <>
      <div>
        <label htmlFor="service_status" className="form-label">Service status</label>
        <select
          id="service_status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ServiceStatus)}
        >
          {(Object.keys(SERVICE_STATUS_LABELS) as ServiceStatus[]).map((k) => (
            <option key={k} value={k}>{SERVICE_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>
      {comingBack ? (
        <div>
          <label htmlFor="hospital_returned_on" className="form-label">{returnQuestion(current)}</label>
          <input
            id="hospital_returned_on"
            name="hospital_returned_on"
            type="date"
            required
            max={todayIso}
            min={hospitalSince ?? undefined}
            defaultValue={todayIso}
          />
          <p className="form-hint">Their paused checks fall due 7 days after this date.</p>
        </div>
      ) : null}
    </>
  );
}
