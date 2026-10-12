# Fixture review scope

PR #367 demonstrates the review noise from a format change touching many fixture
Resources. CodeRabbit and the ImpactGate source-only measure exclude
`packages/app/fixture/**` and `packages/app/example/**`. The all-files impact
measure still reports the complete change. Fixture builders, test helpers,
executable typing fixtures, tests and schema examples stay in scope.

CodeRabbit's filters also affect its sparse checkout: excluded data is
unavailable as review context. The fixture validation and application tests
continue to run in CI.

GitHub's `.gitattributes` uses `linguist-generated=true` for those two directories
to collapse their diffs by default. This is a display policy for fixture data,
including authored content, rather than a claim that every file was generated.
Reviewers can expand the files. It also excludes them from language statistics;
it does not remove files from a PR or guarantee exclusion in other review bots.

Copilot's hard content exclusions live in repository settings. GitHub documents
these as available to Copilot Business and Enterprise organisations. If that
setting is available, use these paths under Settings → Copilot → Content exclusion:

```yaml
- '/packages/app/fixture/**'
- '/packages/app/example/**'
```

`excludeAgent: code-review` excludes an instruction document from the reviewer,
not the files that document matches.

Sources checked on 2026-10-12:

- [CodeRabbit configuration](https://docs.coderabbit.ai/reference/configuration)
- [GitHub diff display attributes](https://docs.github.com/en/repositories/working-with-files/managing-files/customizing-how-changed-files-appear-on-github)
- [Copilot content exclusion](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/content-exclusion)
- [Configuring Copilot exclusions](https://docs.github.com/en/copilot/how-tos/configure-content-exclusion/exclude-content-from-copilot)
