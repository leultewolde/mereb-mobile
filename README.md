# Mereb Mobile

## Release Tagging

Release tags are created automatically only for merged PRs to `main` that carry exactly one of these labels:

- `release:patch`
- `release:minor`
- `release:major`

Create these labels in the mobile repo settings if they do not already exist.

The `mobile-auto-tag` GitHub workflow computes the next `vX.Y.Z` tag from the latest existing `v*` tag and pushes it to the mobile repo. That tag is then consumed by the existing EAS `mobile-release` workflow.
