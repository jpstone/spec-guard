# Implementation Notes

Implement in the shared UI component library.

Prefer semantic HTML and role/name queries in tests.

Browser automation is not required unless the component contract depends on real browser behavior (focus management, keyboard navigation, layout, or multi-component workflows).

## What Not To Do

- Do not test CSS class names as the contract.
- Do not add page-specific copy to the reusable component.
- Do not create a one-off component outside the shared library.
