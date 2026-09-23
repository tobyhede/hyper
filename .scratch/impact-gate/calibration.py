#!/usr/bin/env python3
"""Calibration for ticket 04: one row per branch from the Impact workflow's PR runs.

Reads each run's log through `gh run view --log` and parses ImpactGate's
markdown report out of it, so it breaks when ImpactGate changes that format.
It is evidence for a decision, not tooling: nothing runs it but a reader.

Usage: python3 .scratch/impact-gate/calibration.py [--limit N] [--cache DIR]
"""

import argparse
import json
import pathlib
import re
import statistics
import subprocess
import sys

REPO = "tobyhede/hyper"

# Mechanical sweeps: breadth-squared inflates the total and they carry little
# risk, so they are shown but left out of the distribution figures.
CODEMOD_BRANCHES = {
    "map-resource-01": "PR #249, English prose sweep before the rename",
    "map-resource-02": "PR #250, Diagram->Map and Thing->Resource rename",
}

# Driver rows whose figures were checked by hand and are not the function's
# own: lizard 1.23 mis-spans them. Keyed by (location, branch); None matches
# every branch. Every row not listed here is unverified, not verified.
MIS_SPANNED = {
    ("packages/app/src/components/CommandDock.tsx:ResourcesTrigger", None):
        "9-line branchless function; lizard spans it to the end of the file",
    ("packages/app/src/components/CommandDock.tsx:ThingsTrigger", None):
        "the same function under its old name",
    ("packages/app/src/App.tsx:runEntityCommand", None):
        "6-line arrow with one optional chain",
    ("packages/persistence/src/session-registry.ts:plan", None):
        "five units share the name; the reported span is not any one of them",
    ("packages/app/src/space-authoring.ts:deriveCompletedEdit", "snapshot-edits-split-03"):
        "lizard ends the span at 1116; the function runs 943-1463",
}

STRIP = re.compile(r"^Change impact\t[^\t]*\t\S+\s?")
HEAD = re.compile(r"## Change impact: ([\d,]+)\s+\S+\s+(\w+)")
GRADE = re.compile(r"\| grade \| ([\d.]+)th percentile \(\w+, blended n=(\d+), w=([\d.]+)\)")
FILES = re.compile(r"\| files changed \| (\d+) \|")
DRIVER = re.compile(
    r"\|\s*([\d,]+)\s*\|\s*`([^`]+)`\s*\|\s*_file scope_\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\w+)\s*\|"
)


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def pr_runs(limit: int) -> list[dict]:
    # Only finished, green runs carry both reports: the workflow cancels a
    # superseded run, and one still in progress has no summary yet.
    out = gh("run", "list", "--repo", REPO, "--workflow=impact.yml", "--limit", str(limit),
             "--json", "databaseId,event,headBranch,createdAt,status,conclusion")
    return [r for r in json.loads(out)
            if r["event"] == "pull_request" and r["status"] == "completed" and r["conclusion"] == "success"]


def run_log(run_id: int, cache: pathlib.Path | None) -> str:
    if cache:
        path = cache / f"{run_id}.log"
        if path.exists() and path.stat().st_size:
            return path.read_text(errors="replace")
    text = gh("run", "view", str(run_id), "--repo", REPO, "--log")
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / f"{run_id}.log").write_text(text)
    return text


def parse_section(lines: list[str]) -> dict | None:
    text = "\n".join(lines)
    head = HEAD.search(text)
    if not head:
        return None
    grade, files = GRADE.search(text), FILES.search(text)
    return {
        "score": int(head.group(1).replace(",", "")),
        "verdict": head.group(2),
        "pct": float(grade.group(1)) if grade else None,
        "n": int(grade.group(2)) if grade else None,
        "w": float(grade.group(3)) if grade else None,
        "files": int(files.group(1)) if files else None,
        "drivers": [
            {"cost": int(c.replace(",", "")), "loc": loc, "cc": int(cc), "wmc": int(wmc), "kind": kind}
            for c, loc, cc, wmc, kind in DRIVER.findall(text)
        ],
    }


def parse_report(log: str) -> dict:
    lines = [STRIP.sub("", line).rstrip() for line in log.split("\n")]
    marks = [i for i, line in enumerate(lines) if line.strip() in ("# With tests", "# Without tests")]
    if len(marks) < 2:
        return {"with": None, "without": None}
    return {"with": parse_section(lines[marks[0]:marks[1]]), "without": parse_section(lines[marks[1]:])}


def mis_span(loc: str, branch: str) -> str | None:
    return MIS_SPANNED.get((loc, branch)) or MIS_SPANNED.get((loc, None))


def cell(section: dict | None) -> str:
    if section is None:
        return "no source to score"
    pct = f"p{section['pct']}" if section["pct"] is not None else "seed"
    return f"{section['score']:,} / {pct} / {section['files']}f"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--cache", type=pathlib.Path)
    args = parser.parse_args()

    # One row per branch: its most recent run.
    latest: dict[str, dict] = {}
    for run in pr_runs(args.limit):
        if run["headBranch"] not in latest or run["createdAt"] > latest[run["headBranch"]]["createdAt"]:
            latest[run["headBranch"]] = run

    rows = []
    for branch, run in sorted(latest.items(), key=lambda kv: kv[1]["createdAt"]):
        rows.append({"branch": branch, "run": run["databaseId"], "date": run["createdAt"][:10],
                     "conclusion": run["conclusion"], **parse_report(run_log(run["databaseId"], args.cache))})

    print("| date | branch | with tests (score / grade / files) | without tests | job |")
    print("|---|---|---|---|---|")
    for r in rows:
        mark = " (codemod)" if r["branch"] in CODEMOD_BRANCHES else ""
        print(f"| {r['date']} | `{r['branch']}`{mark} | {cell(r['with'])} | {cell(r['without'])} | {r['conclusion']} |")

    print()
    for key, label in (("with", "With tests"), ("without", "Without tests")):
        pcts = [r[key]["pct"] for r in rows
                if r[key] and r[key]["pct"] is not None and r["branch"] not in CODEMOD_BRANCHES]
        warns = sum(1 for r in rows if r[key] and r[key]["verdict"] == "WARN" and r["branch"] not in CODEMOD_BRANCHES)
        if pcts:
            q = statistics.quantiles(pcts, n=4)
            print(f"- {label}, codemods excluded: {len(pcts)} branches, median p{statistics.median(pcts):.1f}, "
                  f"quartiles p{q[0]:.1f}/p{q[2]:.1f}, max p{max(pcts)}, WARN {warns}")

    print("\nDriver rows (with tests), mis-span marks from hand checks; unmarked rows are unverified:\n")
    print("| branch | location | cc | wmc | kind | check |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        for d in (r["with"] or {}).get("drivers", []):
            note = mis_span(d["loc"], r["branch"])
            print(f"| `{r['branch']}` | `{d['loc']}` | {d['cc']} | {d['wmc']} | {d['kind']} | "
                  f"{'mis-spanned: ' + note if note else 'unverified'} |")


if __name__ == "__main__":
    sys.exit(main())
