#!/bin/bash
# Be Care Compliant: Supabase tools may only ever touch the Be Care Compliant project.
#
# Runs before every Supabase tool call (see .claude/settings.json). It blocks:
#   1. any call that names a Supabase project other than Be Care Compliant,
#   2. the project level tools this project never uses (create, pause, restore, branching), and
#   3. any call it cannot read, so a broken payload never slips through.
# Anything else passes on to the normal permission prompts. Exit code 2 blocks the call and
# shows the message to Claude. Written for the bash that ships with macOS (3.2): no jq needed.

BCC_PROJECT="bgrtcvyjuwopunpnudeu"

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

shopt -s nocasematch
if [[ $tool != *supabase* ]]; then
  exit 0
fi

case "$tool" in
  *__create_project | *__pause_project | *__restore_project | *__create_branch | \
  *__delete_branch | *__merge_branch | *__reset_branch | *__rebase_branch)
    block "$tool is never used on this project. If it is really needed, ask Phil to do it in the Supabase dashboard."
    ;;
esac
is_get_project=0
case "$tool" in
  *__get_project) is_get_project=1 ;;
esac
shopt -u nocasematch

project=""
re_project='"project_id"[[:space:]]*:[[:space:]]*"([^"]*)"'
re_id='"id"[[:space:]]*:[[:space:]]*"([^"]*)"'
if [[ $input =~ $re_project ]]; then
  project="${BASH_REMATCH[1]}"
elif [[ $is_get_project -eq 1 && $input =~ $re_id ]]; then
  project="${BASH_REMATCH[1]}"
else
  exit 0
fi

if [[ "$project" != "$BCC_PROJECT" ]]; then
  block "$tool was aimed at Supabase project $project. Be Care Compliant is $BCC_PROJECT. Never run anything in joincarenow (afwfutlwuhqzdihwsibr) or carer-academy (bamokbdtlzllbrsdxywp)."
fi

exit 0
