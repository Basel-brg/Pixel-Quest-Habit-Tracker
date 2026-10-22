---
name: Reward economy compatibility
description: Why historical payouts and reward eligibility must remain separate from newer economy rules
---

Freeze a completion's first actual XP and Gold payout, including when it is undone and later completed again. Do not retroactively apply new prices, buffs or difficulty changes to it.

**Why:** The earlier app granted Gold equal to awarded XP, while the RPG economy introduced different Gold rates. Recomputing old awards would change preserved balances; recomputing undo/redo with new buffs or prices would let users generate currency without additional discipline.

**How to apply:** When extending progression rules, preserve historical award amounts and reverse the exact recorded amounts. Reward eligibility checks all configured conditions, but spending is only the explicitly configured claim cost; a Gold eligibility gate is not an additional charge. Claimed trophies and defeated bosses are not replayable payouts.
