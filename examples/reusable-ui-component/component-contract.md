# Component Contract: `EmptyState`

## Package / Location

`@app/ui/EmptyState`

## Props / API

```ts
type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};
```

## States

- Default: title only.
- With description.
- With action.

## Accessibility Contract

- Title is rendered as a heading.
- Action is a button with accessible name equal to `actionLabel`.

## Required Unit / Component Tests

- Renders required title.
- Renders optional description.
- Renders optional action button.
- Calls `onAction` when action is clicked.
