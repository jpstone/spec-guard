# Implementation Notes

Implement in the shared UI component library.

Prefer semantic HTML and role/name queries in tests.

Browser automation is only required when the component contract includes behavior that a JSDOM or virtual DOM environment cannot accurately simulate (focus management, keyboard navigation, scroll, viewport layout, or hydration).

## What Not To Do

- Do not test CSS class names as the contract.
- Do not add page-specific copy to the reusable component.
- Do not create a one-off component outside the shared library.
