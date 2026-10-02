---
description: Limit chip counts, choose a refill policy, and keep counts across page loads.
---

# Chip supply

Each chip kind has a `count`. Leave it out for unlimited. Spent chips come back according to `supply.refill`:

<<< ../examples/chip-supply.ts#refill

When every chip is spent and none can come back, the board locks for good.

## Keeping counts across page loads

The library never stores anything; your app owns its state. To keep chip counts, save the snapshot from `onSupplyChange` and pass it back as `count`:

<<< ../examples/chip-supply.ts#persist

Unlimited counts are `Infinity`, which JSON stores as `null`. If you persist unlimited kinds, read them back with `?? Infinity`.
