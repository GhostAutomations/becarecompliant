import { redirect } from "next/navigation";

// Check configuration moved to Settings > People. Kept as a redirect so any old
// links or bookmarks still land in the right place.
export default function PeopleChecksRedirect() {
  redirect("/settings/people");
}
