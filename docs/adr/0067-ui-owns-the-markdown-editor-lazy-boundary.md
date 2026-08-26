# UI owns the Markdown editor lazy boundary

Status: accepted
Refines: 0063
Related: 0047, 0050, 0052, 0064

`@project/ui` owns the complete boundary around CodeMirror: `MarkdownSourceEditor`,
the `markdown-source-editor-lazy` split point that loads it, and
`MarkdownCardBody`, the presentation component that consumes that split point.
Application code does not import the specialist editor subpath.

ADR 0063 put CodeMirror behind a Hyper-owned component and required it to stay
out of the initial bundle. At that time the application owned the only consumer
and therefore the lazy import. ADR 0064 added `MarkdownCardBody` inside `ui`, so
leaving the split in `app` would either make `ui` import CodeMirror statically or
make the Card body accept its central editing behavior from an application
caller. Both divide one presentation boundary between packages.

The lazy module therefore lives beside its consumers in `ui`. The package barrel
may export components that reach it dynamically, but no source module may import
`MarkdownSourceEditor` as a runtime value except that lazy module. Repository
evidence scans the `ui` source tree for this rule, including wrapped and multiline
static imports; type-only imports remain permitted because they emit no runtime
dependency.

## Consequences

`ui` decides how Markdown editing is loaded as well as how it is presented.
`app` supplies authored state and completion operations without knowing that
CodeMirror exists. The application import restriction for `@project/ui/*` has no
editor exception, and a future second `ui` consumer reuses the same split rather
than creating another one.
