#!/usr/bin/env bash
# Create the public GitHub repository and publish this complete Pages project.
set -euo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v gh >/dev/null || { echo 'Install GitHub CLI first: https://cli.github.com/'; exit 1; }
command -v git >/dev/null || { echo 'Install Git first.'; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web
scopes="$(gh api --include --silent user | tr -d '\r' | sed -n 's/^[Xx]-[Oo]auth-[Ss]copes: //p')"
if [[ -n "$scopes" && "$scopes" != *workflow* ]]; then
  gh auth refresh --hostname github.com --scopes workflow
fi
owner="$(gh api user --jq .login)"
repository="${1:-$owner/riemann}"
[[ "$repository" == */* ]] || repository="$owner/$repository"
domain="$(cat CNAME)"
echo "Preparing https://github.com/$repository and GitHub Pages for $domain"
branch="$(git branch --show-current)"
if [[ "$branch" != main ]]; then echo 'Run this script from the main branch.'; exit 1; fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Review and commit your intended changes before publishing.'
  exit 1
fi
if ! gh repo view "$repository" --json nameWithOwner >/dev/null 2>&1; then
  gh repo create "$repository" --public --description 'Open Riemann proof archive, independent Lean checker, and source visualizations'
fi
url="https://github.com/$repository.git"
if git remote get-url github >/dev/null 2>&1; then
  actual="$(git remote get-url github)"
  [[ "$actual" == "$url" || "$actual" == "git@github.com:$repository.git" ]] || { echo "Remote github points to another repository: $actual"; exit 1; }
else
  git remote add github "$url"
fi
gh auth setup-git --hostname github.com
echo 'Pushing the committed main branch. The first push may take time.'
if ! git -c pack.threads=2 push -u github main; then
  echo 'If GitHub reports missing workflow permission, run: gh auth refresh -h github.com -s workflow'
  echo 'Then rerun this script. No force push is used.'
  exit 1
fi
if gh api "repos/$repository/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$repository/pages" -f build_type=workflow >/dev/null
else
  gh api --method POST "repos/$repository/pages" -f build_type=workflow >/dev/null
fi
gh api --method PUT "repos/$repository/pages" -f cname="$domain" >/dev/null
head="$(git rev-parse HEAD)"
run_id=''
for attempt in 1 2 3 4 5; do
  run_id="$(gh run list --repo "$repository" --workflow pages.yml --branch main --commit "$head" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
  [[ -n "$run_id" ]] && break
  sleep 2
done
if [[ -z "$run_id" ]]; then
  gh workflow run pages.yml --repo "$repository" --ref main
  sleep 3
  run_id="$(gh run list --repo "$repository" --workflow pages.yml --branch main --commit "$head" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
fi
echo
echo "Deployment started: https://github.com/$repository/actions"
echo "Cloudflare DNS: CNAME  ${domain%%.*}  ${repository%%/*}.github.io  (DNS only)"
echo 'After DNS resolves and GitHub provisions the certificate, enable Enforce HTTPS under Settings > Pages.'
echo "The Lean proof check runs independently; it is not required to finish before the website deploys."
if [[ -n "$run_id" ]]; then
  gh run watch "$run_id" --repo "$repository" --exit-status
  gh api "repos/$repository/pages" --jq .html_url
else
  echo 'The workflow is queued. Open the Actions URL above to follow the build.'
fi
