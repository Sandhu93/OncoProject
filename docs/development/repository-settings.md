# Repository settings (GitHub)

These settings cannot be committed as code; the repository administrator applies them in GitHub. The repository is `Sandhu93/OncoProject`, default branch `main`, and the CI job to require is `verify` (workflow "Development checks").

## Before you start

- Add both developers as collaborators with **Write** access (Settings, Collaborators). Required reviews only work when someone other than the author can approve.
- Branch protection on a **private** repository needs a paid GitHub plan. On the free plan the rules save but are not enforced. The repository owner should confirm the plan (Settings, Billing) before relying on them.
- Open one pull request first so CI has run once; the `verify` check name only appears for selection after a run.

## Rules for `main`

| Setting                                             | Value                                   | Why                                                   |
| --------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| Require a pull request before merging               | On                                      | No direct pushes to `main`.                           |
| Required approvals                                  | 1                                       | The lead or the other developer reviews every change. |
| Dismiss stale approvals when new commits are pushed | On                                      | A reviewer approves the code that merges.             |
| Require status checks to pass                       | On, select `verify`                     | Format, lint, types, tests and builds must pass.      |
| Require branches to be up to date before merging    | On                                      | Avoids merging a change tested against an old `main`. |
| Require conversation resolution                     | On                                      | Review comments cannot be ignored.                    |
| Block force pushes                                  | On                                      | History and migrations stay intact.                   |
| Allow deletion                                      | Off                                     | `main` cannot be deleted.                             |
| Do not allow bypassing the above settings           | On once there are two or more reviewers | Applies the rules to the administrator too.           |

Where to click: Settings, Rules, Rulesets, New branch ruleset, target the default branch, then set the rows above. The older path is Settings, Branches, Add branch protection rule, branch name `main`.

## Same rules from the command line

With the GitHub CLI signed in as the repository administrator:

```powershell
@'
{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | gh api -X PUT repos/Sandhu93/OncoProject/branches/main/protection --input -
```

Set `enforce_admins` to `true` once a second reviewer exists. Confirm with `gh api repos/Sandhu93/OncoProject/branches/main/protection`.

## Review rules for the team

- Every migration, workflow rule and permission change needs the lead as a reviewer.
- Never edit an applied migration; add a new numbered file. The migration runner rejects edits anyway.
- Do not commit `.env`, database dumps or patient data. The CI uses synthetic data only.
