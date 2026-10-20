# 03 — A mounted session is read-only

Status: resolved

**What to build:** read-only as an answer of the whole session (ADR 0130).

- `authoring-availability.ts` gains a mounted answer. It withholds every Edit: Open and Close, renames, deletes, Resource, Map and Graph creation, drags, connects, resize and content editing. It keeps selecting Resources, navigating (Space, Map and Graph choice, Open Spaces, Enter, Exit) and Present.
- Do not use the `read-only` Map surface policy for this. `surfaceOffers` withholds Present under it, and `withSurfacePolicy` withholds every node gesture, which leaves Enter unreachable (`packages/app/src/map-surface-policy.ts`). That policy keeps meaning an embedding that is not yours.
- The in-page HTTP application from 02 refuses every write the page sends rather than storing it. The first working load of a mapless Space (`maps-and-graphs.md` R16) still commits, inside the in-page host while it answers a read, so a mapless Meta Space opens.
- The Command Dock shows a read-only mark. A mounted session reports no persistence state, `Persisted` included. Use the `shadcn-first-ui` skill for the mark.

**Depends on:** 02.

**Acceptance:**

- `authoring-availability` tests: the mounted answer offers Present, Enter, Exit and navigation, and offers no Edit.
- A test over 02's composition shows that a write sent to the backend is refused, and that a mapless Space still opens.
- A component or story test shows the mark, with no persistence status beside it.

## Answer

Built. The in-page HTTP application's write refusal was built in 02.

- **The composition input is `mounted: boolean`**, default `false`. It enters as `createSpaceStartup`'s last parameter (`packages/app/src/space.ts`), goes to `createOpenSpaces` (`OpenSpacesOptions.mounted`) and `composeApp` (`ComposeAppDependencies.mounted`), and is answered back as `ComposedApp.mounted`. `useMapSurface` reads it from the composition into availability, so an embedded Map drawn from another mounted Space answers it too. 02 sets it.
- **The mounted answer** (`authoring-availability.ts`): `AuthoringInProgress.mounted` withholds `resourcesView`, `chromeTitleEdit`, `entityEdits`, `deleteResource`, `addResource`, `createMap`, `authorOnCanvas`, `authorInEmbeddedMap`, `editResourceBody`, `connectOnCanvas`, `dragNodes` and `embeddedMapEdit`, and leaves `present`, `selectNodes`, `navigate` and `replaceSession` as the rest of the session answers them. It is applied after the replacement answer, so nothing in progress brings an Edit back. The `read-only` Map surface policy is not used.
- **Two new answers**, each the old behaviour except when mounted:
  - `resourceActions`: whether a selected Resource's rail draws its Actions menu. It is `authorOnCanvas`, except in a mounted session, where it keeps the value `authorOnCanvas` would have unmounted. This keeps a Space Resource's Enter, Open in New Tab and the copy links reachable. Each Edit in the menu still answers to its own availability: Create Reference to `addResource`, Remove from Map to `authorOnCanvas`, Delete from Space to `deleteResource`. Connect to Resource is now offered only under `authorOnCanvas` (`SpaceCanvas.tsx`), which is where the menu was offered before.
  - `embeddedMapEdit`: whether an Open Space Resource offers Edit (portal Edit). It is `true` everywhere except a mounted session. A running replacement keeps it drawn as before.
- **What a mounted session withholds**: Open and Close (control and Enter/Space key), title rename (control and `F2`), resize, Markdown and Image content edit, Ur shape change, drags, connection handles and the Edge lifecycle, `C`, Backspace/Delete, image drop and paste, Space Resource Map/Graph selection (rail drawn disabled) and portal Edit, the rail's Create Reference, Connect, Remove from Map and Delete from Space, the Dock's Space/Map/Graph rename, New Map, New Graph, recolour, head shape and delete, every Create, and the Resources list. The list is withheld whole (`resourcesView` false), because its `disabled` is "the Map can accept membership edits at all" and every row command is an Edit. An addressed Resource outside the Map therefore does not disclose the list in a mounted session.
- **The mark**: `ReadOnlyMark` in `CommandDock.tsx`, the `@project/ui` `Badge` (outline) with a new `ReadOnlyIcon` (Lucide `Lock`, `packages/ui/src/icons.tsx`) and the text "Read-only", trailing the clusters after a divider. `DockChrome.persistence` is `null` in a mounted session, so the Dock draws the mark and no `PersistenceReport`. `App.tsx` omits the hidden `persistence-status` element.
- **Evidence**: `packages/app/test/authoring-availability.test.ts` ("a mounted session"), `packages/app/test/mounted-session.test.tsx` (the mark without a persistence status, Present kept, Create unavailable, no Open/rename/drag/connect, `C` and Enter inert, portal Edit withheld, the rail's Enter kept and its Edits absent, each against the unmounted application), the `Space/Command Dock` `Mounted` story with claim `command-dock-marks-a-mounted-session-read-only` and its Ladle test in `packages/app/ladle-e2e/command-dock.spec.ts`. The claim records an `applicationEvidence` exemption until a host mounts an aggregate.
- **No domain-side refusal was added.** Space Authoring gets no session mode and no refusal code. Enforcement below the surfaces is the in-page HTTP application's refusal, built in 02.
- The in-page write refusal: `packages/app/src/mount/mount.ts` answers every request but `GET` and `HEAD` `forbidden` (403), and `packages/app/test/mount.test.tsx` holds that a commit and an image upload store nothing. `mount/mounted-startup.ts` sets `mounted`.
