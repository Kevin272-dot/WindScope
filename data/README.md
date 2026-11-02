# Data

`snapshots/january-2026.json` is the verified January Elexon snapshot included in
the repository and backend Docker image. It contains FUELHH WIND actuals and
January delivery WINDFOR publications, with source fields preserved and retrieval
metadata included. The backend API reads this file and does not call Elexon for
each wind-report request.

To refresh the snapshot intentionally, run the January ingestion command documented
in the root README. Generated or sample values must not be substituted for source
records. The committed snapshot is Elexon data retrieved on 30 October 2026.
