# Dashboard UI Design Principles

These rules apply to new and redesigned Kody dashboard pages.

## Choose the page type first

Do not force every feature into the same layout. Choose the page shape from
the user's main task:

| Page type            | Use when                                         | Reference     |
| -------------------- | ------------------------------------------------ | ------------- |
| List page            | Users browse many independent resources          | Guided Flows  |
| Full management page | Users operate on one selected resource           | Agents        |
| Configuration page   | Users edit one structured configuration document | Engine Config |

### List page

The page helps users find, compare, and choose resources.

- Use a clear page header with one primary create action.
- Show only the summary needed to choose an item.
- Keep status, metadata, and actions in consistent positions.
- Use cards or rows consistently within the list.
- Keep editing in a dialog or separate detail surface when the editor is complex.
- Make empty, loading, error, and filtered-empty states explicit.
- Keep destructive actions separate from view and edit actions.

### Full management page

The page helps users inspect and operate on one selected resource.

- Use a master-detail layout when users switch between resources frequently.
- Keep resource navigation visible while the selected resource is open.
- Put the main editor or detail view in the largest area.
- Keep status and operational actions easy to find.
- Separate routine editing from run, dispatch, archive, and delete actions.
- Preserve the selected resource in the URL when the page supports direct access.

### Configuration page

The page helps users edit one structured configuration document.

- Group fields by configuration domain, not by implementation order.
- Keep the form dense enough for scanning but give sections clear spacing.
- Make saved, unsaved, saving, and failed-save states visible.
- Put validation beside the field that needs attention.
- Keep save and reset actions predictable and consistently placed.
- Collapse advanced or rarely changed settings by default.
- Show relationships between dependent settings instead of scattering them.

## Keep the information model simple

- Use one input for one user concept.
- Merge fields when they describe the same intent.
- Before adding a control, ask whether the result already happens automatically.
- Do not repeat the same information in a header, field label, helper text, and preview.

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
