# Working on The Living Planet

Read `specifications/AGENT_WORKING_RULES.md` for the product and engineering rules. This file covers how a
change moves from idea to merged pull request.

## Every change starts with a Linear ticket

Tickets live in the **The Living Planet** team (key `LIV`) of the Fusion's Lab Linear workspace. Create the
ticket before writing code, then do the work on the branch Linear generates for it.

1. **Ticket:** a clear title, a description with what to change and when it is done, a category label and
   an assignee.
2. **Branch:** the ticket's own git branch name from Linear, exactly as given, branched from `main`
   (for example `feature/liv-1-document-contribution-standards-in-claudemd`). This links the branch,
   commits and pull request to the ticket.
3. **Commits:** `[Category] LIV-<n>: <summary>`, for example
   `[Fix] LIV-12: Stop water stock going negative after a drought turn`. The message is that one line only:
   no body and no trailers.
4. **Pull request:** opened against `main`, with the title, description and labels below.

## Categories

| Prefix       | Use for                                  | Linear label | GitHub label    |
| ------------ | ---------------------------------------- | ------------ | --------------- |
| `[Feat]`     | new behavior or features                 | Feature      | `feature`       |
| `[Fix]`      | bug fixes                                | Bug          | `bug`           |
| `[Refactor]` | restructuring with no behavior change    | Refactor     | `refactor`      |
| `[Docs]`     | documentation only                       | Docs         | `documentation` |
| `[Test]`     | adding or fixing tests                   | Test         | `test`          |
| `[Chore]`    | tooling, dependencies, maintenance       | Chore        | `chore`         |

The same prefix is used on the commit and the pull request title.

## Pull requests

- **Title:** `[Category] <title>`, for example `[Refactor] Move domain entities into src/domain/entities`.
- **Description**, in three sections:
  - **Summary:** what changed and why, and the Linear ticket (`LIV-<n>`).
  - **Changes:** the concrete edits, file by file or area by area.
  - **Testing:** the commands run and their results.
- **Labels:** the category's GitHub label, plus one label per area of code touched: `domain`,
  `application`, `contracts`, `infrastructure` or `ui`.

## Merging

- Pull requests merge with **Rebase and merge** by default, never with a merge commit. Each commit lands on
  `main` as it is, so every commit must follow the commit format above.
- Squash when required: if a pull request has several commits that belong together (fixups, review
  follow-ups), squash them into one commit on the branch before merging, or merge with **Squash and merge**.
  The squashed commit still uses the one-line commit format.
- Keep a branch current by rebasing it onto `main` (`git fetch origin main && git rebase origin/main`) and
  pushing with `git push --force-with-lease`. Never merge `main` into a branch.

## Before pushing

Run `npm run typecheck` and `npm test`. Both must pass.
