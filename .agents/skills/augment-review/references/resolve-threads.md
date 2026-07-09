# Resolve Threads

## Overview

GitHub REST API does not support resolving review threads. Use GraphQL mutations instead.

---

## Step 1: Get Thread Node IDs

Query all review threads and match by `databaseId` to the comment IDs tracked during analysis.

```bash
gh api graphql -f query='
  query {
    repository(owner: "{owner}", name: "{repo}") {
      pullRequest(number: {pr_number}) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                databaseId
                body
              }
            }
          }
        }
      }
    }
  }
'
```

Match `comments.nodes[0].databaseId` against the tracked comment IDs to find the thread `id` (node ID) for each comment.

### Pagination

This query returns up to 100 threads. For PRs with >100 review threads, use cursor-based pagination:

```bash
gh api graphql -f query='
  query {
    repository(owner: "{owner}", name: "{repo}") {
      pullRequest(number: {pr_number}) {
        reviewThreads(first: 100, after: "{endCursor}") {
          pageInfo { hasNextPage endCursor }
          nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
        }
      }
    }
  }
'
```

In practice, >100 threads is rare.

---

## Step 2: Resolve Threads

```bash
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: {threadId: "{thread_node_id}"}) {
      thread { isResolved }
    }
  }
'
```

---

## Resolution Strategy

Resolve threads where:
- Classification was **VALID** and the fix was committed (confirmation reply posted)
- Classification was **INVALID** and a decline reply was posted

Do **not** resolve threads that:
- Were not processed (e.g., filtered out as bot replies)
- Could not be matched to a tracked comment ID

---

## Error Handling

- If GraphQL returns an authorization error, skip resolution and notify the user
- Log which threads were resolved and which were skipped
- If the mutation fails for a specific thread, continue with the next one
