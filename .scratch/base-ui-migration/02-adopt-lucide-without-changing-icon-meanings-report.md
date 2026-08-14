# 02 — Lucide icon migration report

Every exported interface icon from `@project/ui` now uses Lucide. The existing
facade names remain public so consumers do not need unrelated import churn.

| Hyper facade | Meaning | Lucide glyph |
| --- | --- | --- |
| `FlowIcon` | Computed flow View | `Workflow` |
| `GridIcon` | Computed grid View | `Grid2x2` |
| `LayoutIcon` | Authored spatial Layout | `PanelsTopLeft` |
| `GraphIcon` | Directed Graph | `Network` |
| `PresentIcon` | Start presentation | `Play` |
| `EditIcon` | Edit Card content | `Pencil` |
| `ChevronDownIcon` | Opens a list or menu | `ChevronDown` |
| `PlusIcon` | Create a Markdown Card | `Plus` |
| `AliasIcon` | Card delegates to another Card | `CornerDownRight` |
| `ConnectIcon` | Start a Graph connection | `ArrowRightFromLine` |
| `MarkdownIcon` | Card owns Markdown | `FileText` |
| `CheckIcon` | Current selection | `Check` |

No exception is retained. Each existing local drawing has an honest Lucide
meaning; the Card-specific semantics are supplied by its surrounding control or
the labelled `CardKindIcon`, not by a bespoke SVG silhouette. Lucide's default
decorative behavior keeps these glyphs out of the accessibility tree, while the
controls and `CardKindIcon` retain their existing accessible names.
