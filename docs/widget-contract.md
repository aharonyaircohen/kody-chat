# Widget contract

A widget is business-owned browser UI mounted inside a Kody view. Kody owns
only the mount lifecycle, authenticated CMS access, and the explicit Kody
actions below. A widget does not know whether Chat, GuidedFlow, or another
compatible surface mounted it.

## Mount contract

Each published widget bundle exports a default mount function:

```ts
export default function mount(element, props) {
  const { data, theme, cms, kody } = props;

  // Render business-owned UI into element.

  return () => {
    // Remove listeners and other widget-owned resources.
  };
}
```

- `data` is opaque business input. Kody passes it through unchanged.
- `theme` is `"light"` or `"dark"`.
- `cms.get()` and `cms.list()` use Kody's authenticated repository scope.
- Business SDKs and business-service calls remain widget-owned.

## Kody actions

```ts
kody.postToChat({ content: "Try again." });
kody.sendToKody({ message: "Explain this answer." });
kody.submitResult({ actionId: "correct", data: { answerId: "seven" } });
```

- `postToChat` displays widget-authored text. It does not start an AI turn and
  does not finish the widget.
- `sendToKody` sends a widget-authored message through the active Kody chat
  pipeline. The input is visibly identified as coming from the widget.
- `submitResult` finishes the current interaction. GuidedFlow receives the
  result and may advance; ordinary Chat only marks the widget complete. It
  never calls the model implicitly.

All three actions ignore empty or malformed requests. Once the host marks the
view complete, further widget actions are ignored.

## Ownership boundary

- The widget owns its UI, business logic, validation, feedback, business APIs,
  and persistence of business results.
- Kody owns mounting, cleanup, theme, the CMS adapter, chat output, model
  execution, and delivery of the final result to the current host.
- GuidedFlow may pass generic `data` and consume a generic result, but neither
  side contains widget-specific lesson or question models.
