# Data

The January Elexon ingestion command writes its verified local snapshot to
`snapshots/january-2026.json`. It contains only January FUELHH WIND actuals and
January delivery WINDFOR publications, with source fields preserved and retrieval
metadata included. The backend API reads this file and does not call Elexon for
each dashboard request.

Snapshots are generated from Elexon Insights; do not add fabricated or sample
records. Local snapshot files are ignored by Git.
