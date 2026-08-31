# Computed Views are read-only and Create Layout converts

Status: accepted
Supersedes: 0025
Refines: 0031
Related: 0033, 0035, 0040, 0045, 0053, 0064

A Computed View is a read-only Space View. Card, Alias, placement, Open state,
Graph and Edge authoring operations do not convert it and their controls and
gestures are unavailable while it is selected. Selecting a Computed View remains
navigation, not an Edit, and there is still no edit mode or capability state to
keep in sync.

**Create Layout is the sole transition from a Computed View to authored state.**
It copies the selected Computed View's resolved Card positions and converts its
subject into a newly identified Layout under that View's conversion policy. The
new Layout has no continuing strategy provenance, is selected immediately and
then offers the ordinary Layout authoring surface. The conversion itself remains
visually a no-op: no Card moves when the Layout is created.

This reverses ADR 0025's decision that any interaction touching a Card or Graph
implicitly converts, and narrows ADR 0031's uniform conversion rule to the
explicit command. Wherever later ADRs describe opening, connecting or another
Edit as converting an Algorithmic or Computed View, that trigger no longer
applies; their behavior on an authored Layout remains unchanged.

Implicit conversion made a reading surface appear authorable and let an
accidental gesture author positions for every Card. It also made a command that
explicitly described the transition only one of many paths to the same state.
Requiring Create Layout makes the authored boundary visible before mutation and
leaves every automatic strategy available as a stable reading view.

The cost is an extra explicit action before authoring from a Computed View. We
accept that friction because the command names the consequential operation: it
captures every resolved position and creates durable authored state. We reject
replaying an attempted Edit after creation; the author creates the Layout first
and then performs the Edit on that Layout.
