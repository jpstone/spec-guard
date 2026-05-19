# Tests Outline

Write before implementation:

```text
normalizeEmailAddress(" User.Name@EXAMPLE.COM ") returns "User.Name@example.com"
normalizeEmailAddress("") throws InvalidEmailAddressError
normalizeEmailAddress("missing-at.example.com") throws InvalidEmailAddressError
normalizeEmailAddress("a@b@c") throws InvalidEmailAddressError
```

## Expected Initial Failure

The module or exported function does not exist, or the behavior is not implemented.
