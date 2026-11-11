#!/usr/bin/env python3
"""Removes from the theme the declarations that `theme-check.mjs --audit` listed as "no effect".

    theme-prune.py <theme.css> <out.css> <audit-report.txt> <audit.json> [<report> <json> ...]

Each report is the tool's standard output and each json its --json file, from a run against this very
stylesheet (the line numbers must match). Give one pair per combination of theme options worth
checking (another colour, large text): only what every run calls dead is removed, because a size or a
height can do nothing with normal text and still matter with large text.

Conservative on purpose: a rule is only touched when every one of its selectors matched as written on
the tour, so no state of it went unseen, and never when it styles another plugin's own classes or
defines variables, and sizes that come from the text-size option stay. Compare screenshots before and after (shots-diff.sh) before keeping the result.
"""
import json, re, sys

if len(sys.argv) < 5 or len(sys.argv) % 2 == 0:
    sys.exit(__doc__)
css_path, out_path = sys.argv[1:3]
runs = list(zip(sys.argv[3::2], sys.argv[4::2]))
css = open(css_path).read()


def read_report(path):
    """line of the rule -> None (whole rule) | set of properties"""
    found, section = {}, None
    for line in open(path):
        m = re.match(r"^(\w+): \d+ rules with declarations", line)
        if m:
            section = m.group(1)
            continue
        m = re.match(r"^  no effect\s+(\d+)\s+(.*?)\s+<-", line)
        if m and section == "shared":
            what = m.group(2)
            found[int(m.group(1))] = None if what == "(whole rule)" else {p.strip() for p in what.split(",")}
    return found


# Only what every run agrees on: a declaration that matters with one option set stays.
flagged = None
lowest = {}  # line of the rule -> lowest level among its selectors in any run (2 = matched as written)
for report, data in runs:
    found = read_report(report)
    if flagged is None:
        flagged = found
    else:
        both = {}
        for line in flagged.keys() & found.keys():
            a, b = flagged[line], found[line]
            both[line] = b if a is None else a if b is None else a & b
        flagged = {line: props for line, props in both.items() if props is None or props}
    for s in json.load(open(data))["shared"]:
        lowest[s["line"]] = min(lowest.get(s["line"], 9), s["level"])

KEEP = re.compile(r"romm-|CSSLoader|:root")
out, i, removed, kept = [], 0, 0, []
gap = re.compile(r"\s+|/\*[\s\S]*?\*/")
while i < len(css):
    m = gap.match(css, i)
    if m:
        out.append(m.group(0))
        i = m.end()
        continue
    open_ = css.index("{", i)
    close = css.index("}", open_)
    head, body = css[i:open_], css[open_ + 1:close]
    line = css.count("\n", 0, i) + 1
    i = close + 1
    if line not in flagged:
        out.append(head + "{" + body + "}")
        continue
    if KEEP.search(head) or lowest.get(line, 0) < 2:
        kept.append((line, " ".join(head.split())[:90]))
        out.append(head + "{" + body + "}")
        continue
    props = flagged[line]
    if props is None and "var(--obs-fs-" not in body:
        removed += 1
        out.append("\0")
        continue
    if props is None:
        props = [d.split(":")[0].strip() for d in re.sub(r"/\*[\s\S]*?\*/", "", body).split(";") if ":" in d]
    for p in sorted(props):
        # A size taken from the "text size" option only shows its effect when that option is on.
        body, n = re.subn(r"[ \t]*(?<![\w-])" + re.escape(p) + r"\s*:(?![^;{}]*var\(--obs-fs-)[^;{}]*;?[ \t]*\n?", "", body)
        removed += n
    out.append("\0" if not re.sub(r"/\*[\s\S]*?\*/", "", body).strip() else head + "{" + body + "}")

text = re.sub(r"\n?\0", "", "".join(out))
text = re.sub(r"\n{3,}", "\n\n", text)
open(out_path, "w").write(text)
print(f"removed {removed} rules or declarations; left {len(kept)} listed rules alone:", file=sys.stderr)
for line, head in kept:
    print(f"  kept {line}: {head}", file=sys.stderr)
