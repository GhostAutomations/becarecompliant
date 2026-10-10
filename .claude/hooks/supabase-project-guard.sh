#!/bin/bash
# Be Care Compliant: Supabase tools may only ever touch the Be Care Compliant project.
#
# Runs before every MCP tool call (see .claude/settings.json). The Supabase connection is not
# always named Supabase: in a claude.ai cloud session its tools are mcp__claude_ai_Supabase__*,
# but in the desktop app they carry a random connector id (mcp__d6acb2d9-...__execute_sql). So
# the guard recognises Supabase by what the call asks for, not only by its name. It blocks:
#   1. any MCP call whose input names a project_id other than Be Care Compliant, whatever the
#      tool is called. Every project_id in the input is checked, at any depth, not just the
#      first. Supabase uses project_id; Vercel uses projectId, so ordinary Vercel calls are
#      untouched. A free form field on another connection that happens to hold a project_id
#      key is stopped too: a cautious false stop is better than a missed Supabase call;
#   2. a get_project call whose id is another project (Supabase's form; Vercel uses idOrName);
#   3. the project level Supabase tools this project never uses (create, pause, restore,
#      branching), recognised by a Supabase name or an input only Supabase uses, so Vercel's own
#      create_project and pause_project are not caught;
#   4. any call it cannot read, so a broken payload never slips through.
# Anything else passes on to the normal permission prompts. Exit code 2 blocks the call and
# shows the message to Claude. Written for the bash that ships with macOS (3.2): no jq needed.
# settings.json sets "onFailure": "block", so if this script is missing, crashes or times out,
# the call is blocked too.

BCC_PROJECT="bgrtcvyjuwopunpnudeu"

# Read bytes, not characters: in some locales a regex gives up at the first unusual character
# (an em dash in a query) and would then miss a project_id written after it.
export LC_ALL=C

block() {
  echo "Blocked by the Be Care Compliant guard: $1" >&2
  exit 2
}

input="$(cat)"

tool=""
re_tool='"tool_name"[[:space:]]*:[[:space:]]*"([^"]*)"'
if [[ $input =~ $re_tool ]]; then
  tool="${BASH_REMATCH[1]}"
fi
[[ -n $tool ]] || block "it could not read which tool was called."

# Only read what the tool was asked to do, not the session details around it. A key quoted
# inside a string value always arrives escaped (\"project_id\"), so the patterns below only
# ever match real keys.
args="${input#*\"tool_input\"}"

# check_key KEY: every string given to KEY must be Be Care Compliant. A value it cannot read
# (a number, null, an escaped quote) is blocked rather than guessed at.
check_key() {
  local key="$1" rest="$args" value re_key re_value
  # The regex hands back everything after the key in one step. (Cutting the text with
  # ${rest#*...} instead is slow in bash 3.2: a 250 KB edge function took 30 seconds.)
  re_key="\"$key\"[[:space:]]*:[[:space:]]*(.*)\$"
  re_value='^"([^"\\]*)"'
  while [[ $rest =~ $re_key ]]; do
    rest="${BASH_REMATCH[1]}"
    [[ $rest =~ $re_value ]] || block "$tool gave a $key it could not read, so it was stopped to be safe."
    value="${BASH_REMATCH[1]}"
    if [[ "$value" != "$BCC_PROJECT" ]]; then
      block "$tool gave $key $value. The only Supabase project Claude may touch is Be Care Compliant ($BCC_PROJECT); never joincarenow (afwfutlwuhqzdihwsibr) or carer-academy (bamokbdtlzllbrsdxywp). Any project_id other than Be Care Compliant is stopped, even on a connection that is not Supabase; if this call is not a Supabase call, tell Phil the guard stopped it."
    fi
  done
}

is_supabase=0
re_supabase_key='"(project_id|branch_id|organization_id|confirm_cost_id)"[[:space:]]*:'
[[ $args =~ $re_supabase_key ]] && is_supabase=1

shopt -s nocasematch
[[ $tool == *supabase* ]] && is_supabase=1
banned=0
case "$tool" in
  *__create_project | *__pause_project | *__restore_project | *__create_branch | \
  *__delete_branch | *__merge_branch | *__reset_branch | *__rebase_branch)
    banned=1 ;;
esac
is_get_project=0
case "$tool" in
  *__get_project) is_get_project=1 ;;
esac
shopt -u nocasematch

if [[ $banned -eq 1 && $is_supabase -eq 1 ]]; then
  block "$tool is never used on this project. If it is really needed, ask Phil to do it in the Supabase dashboard."
fi

check_key project_id
[[ $is_get_project -eq 1 ]] && check_key id

exit 0
