# Dashboard UI Design Principles

These rules apply to new and redesigned Kody dashboard pages.

## Use one of the three approved page types

Every new or redesigned page must start from one of these structures. Choose
the type from the user's main task, not from the backend data shape.

| Page type        | Use when                                      | Reference route   | Shared implementation                 |
| ---------------- | --------------------------------------------- | ----------------- | ------------------------------------- |
| Master-detail    | Users browse resources and operate on one     | `/agents`         | `MasterDetailShell`                   |
| Standard content | Users manage one focused list, form, or setup | `/secrets`        | `PageShell` and `PageHeader`          |
| File workspace   | Users browse or manage files and folders      | `/files`, `/docs` | `RepositoryFileSpace` and `FilesPage` |

### 1. Agents-style master-detail page

Use this for resource management when users repeatedly switch between items.

- Keep a searchable resource list on the left and the selected detail on the
  right.
- Use `MasterDetailShell`; do not copy the Agents page's local layout markup.
- Preserve the selected resource in the URL.
- On narrow screens, show either the list or detail with a clear way back.
- Keep create and refresh actions in the shared header.
- Use the shared `EmptyState` for loading, empty, filtered-empty, and
  no-selection states.
- Keep routine editing separate from run, dispatch, archive, and delete actions.

### 2. Secrets-style standard content page

Use this for a focused list, configuration form, setup page, or small manager
that does not need persistent resource navigation.

- Use `PageShell` for the shared header, page width, padding, and scrolling.
- Put one primary action in the header and keep secondary actions subordinate.
- Organize the body as a single readable content flow using shared cards, forms,
  lists, tables, and dialogs.
- Group configuration fields by user concept, not implementation order.
- Show loading, empty, error, validation, saving, saved, and failed-save states
  where they apply.
- Keep destructive actions separate from ordinary view and edit actions.
- Do not introduce a sidebar or master-detail split for a short independent list.

### 3. Files-style file workspace

Use this whenever the user's task centers on files, folders, documents, or a
file-backed content collection.

- Reuse `RepositoryFileSpace` for a scoped file area and `FilesPage` for the
  underlying workspace.
- Keep the tree on the left and the selected file, folder, editor, or preview in
  the main area.
- Configure the shared workspace with a root path, pinned entries, protected
  paths, filters, and transport rather than rebuilding file behavior.
- Preserve file and folder selection in the route when direct access is useful.
- Reuse existing create, upload, rename, move, duplicate, download, and delete
  operations.
- Do not create a separate file tree, editor, storage path, or file API.

## Implementation contract

Before editing a new or redesigned page, state:

1. The selected page type.
2. The existing reference route.
3. The shared layout and UI components that will be reused.
4. Any intentional difference and the user requirement that needs it.

Do not invent another top-level page structure unless all three approved types
have been checked and cannot satisfy a verified requirement. State the exact
gap and obtain explicit user approval before implementing a bespoke structure.

## Apply the simplicity rule before implementation

Before designing or coding user-facing UI:

1. State the user's goal in one sentence.
2. Identify only the concepts required to reach it.
3. Identify what the system already does automatically.
4. Remove duplicate, automatic, speculative, and implementation-specific controls.
5. Design the simplest visible flow that remains correct.

If a control cannot be justified by a distinct user decision, do not add it.

## Keep the information model simple

- Use one input for one user concept.
- Merge fields when they describe the same intent.
- Before adding a control, ask whether the result already happens automatically.
- Do not repeat the same information in a header, field label, helper text, and preview.

## Give routable surfaces stable slugs

- Every dashboard page must have a human-readable title and a stable route
  slug. Every durable item with its own detail route must have a human-readable
  name and stable item slug.
- Use the name for visible titles and accessible labels. Use the slug for
  routing, chat context, automation, and durable references.
- On master-detail pages, keep the collection at `/page-slug` and route a
  selected item as `/page-slug/item-slug`; selection must be reflected in the
  URL, not only held in component state.
- A modal is transient and does not need a slug. Give it an accessible title;
  add a stable identifier only when a verified deep-linking or automation
  contract requires one.
- Ask users for the name and derive new slugs with the shared
  `@kody-ade/base/slug` helper. Do not add a second manual slug input unless an
  external identifier must be preserved.
- Treat a persisted slug as immutable identity. Renaming the visible name must
  not silently change existing routes or references.

## Create hierarchy with structure

- Use page title, section grouping, spacing, and alignment before decoration.
- Remove subtitles and helper copy when the surrounding UI already explains the task.
- A card should represent one meaningful object or task.
- Avoid cards inside cards unless the nesting has a clear meaning.
- Use borders, badges, and tinted backgrounds sparingly.
- Keep secondary actions compact and visually subordinate to the primary action.

## Forms and actions

- Every field needs one clear purpose.
- Use visible labels when they improve clarity; placeholders do not replace labels
  for fields whose purpose may become unclear.
- Preserve accessible names when visual labels are minimized.
- Keep an action next to the content it affects.
- A button must create a distinct result.
- Action names such as `Generate`, `Save`, `Reset`, and `Preview` must describe
  real behavior.
- Any asynchronous action needs loading, success, and error states.
- Do not add a manual refresh or generate button for work that already happens
  automatically.

## Previews and editors

- Keep a preview close to the configuration it represents.
- Use one clear preview surface instead of nested cards and repeated borders.
- Make the preview visually distinct from editing controls without explanatory clutter.
- Keep long editors usable with a sticky preview only when it improves orientation.
- Make the relationship between an input and its preview obvious through alignment.

## Responsive behavior

- Define desktop and mobile layouts intentionally.
- On narrow screens, stack related sections in a predictable order.
- Keep the primary action reachable without excessive scrolling.
- Do not rely on horizontal space alone to explain relationships.
- Check long titles, validation messages, and empty states at narrow widths.

## Accessibility

- Every input and icon-only control must have an accessible name.
- Do not remove visual labels when doing so makes the field ambiguous.
- Use headings and landmarks to communicate page structure.
- Make focus, disabled, loading, error, and success states visible.
- Ensure color is not the only signal for status or selection.

## Verify the real experience

- Inspect the final page at the target desktop and mobile viewports.
- Test the visible interaction and resulting state in a real browser.
- Test loading, empty, error, success, validation, and long-content states.
- Test the canonical repository-scoped URL when the page belongs to a repository.
- Passing unit or route tests does not prove visual quality.
- Re-check layout after the final edit; verification applies to the final diff.
