# Browser Test Readiness Checklist

Use before writing browser automation.

- [ ] User-visible behavior to validate is identified.
- [ ] Mechanically verifiable mockup fidelity points are identified, if applicable.
- [ ] Test can use user-facing selectors: role, label, visible text, or accessible name.
- [ ] `data-testid` is reserved for cases where semantic selectors are insufficient.
- [ ] Test avoids selectors based on styling, DOM depth, or layout implementation.
- [ ] Success, error, loading, empty, and permission-sensitive states are considered where relevant.
- [ ] Accessibility affordances are included where relevant.
