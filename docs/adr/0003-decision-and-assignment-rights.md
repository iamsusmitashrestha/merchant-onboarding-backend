# 0003. Only the assigned reviewer decides; only ADMIN assigns

## Context
The brief gives ADMIN "full operational access", but it also says "Only the assigned REVIEWER may record a risk decision." Those two disagree about ADMIN. It also doesn't say who assigns reviewers.

## Decision
- Approve, reject and request-info only work when `assignedReviewerId === currentUser.id`. ADMIN gets a 403 like everyone else. I followed the more specific rule, and it keeps separation of duties intact.
- Only ADMIN can assign or reassign a reviewer. The assignee has to be an active user with the REVIEWER role, and the application has to be SUBMITTED or IN_REVIEW.
- For a decision, the assigned-reviewer check and the status check run inside the transaction under a pessimistic row lock, so a reassignment can't land between the check and the decision.
- For an assignment, the new reviewer is checked (active, REVIEWER role) with a plain read before the transaction starts. The status check runs inside the transaction under the row lock.

## Alternatives considered
- Let ADMIN decide as well. Convenient, but it contradicts the explicit rule and removes the four-eyes check.
- Let reviewers assign themselves. Then a reviewer picks which applications they get to approve, which is a control weakness.

## Consequences
The roles split cleanly: SALES creates, ADMIN assigns, REVIEWER decides. An admin who needs a decision made urgently has to go through a REVIEWER account assigned to the application. I think that's acceptable, and the assignment is in the audit log.

Assignment takes `expectedVersion`, like an edit. Of two admins reassigning at the same moment, one gets a 200 and the other a 409, so neither assignment is lost silently (ADR 0008).
