# PLAN.md: Test cases

Goal: write the test table that `GOALS.md` requires under Testing. Today the cases are only defined. Running them and recording the results is a later plan.

## Tasks

1. Create `TESTS.md` with one table. Columns: ID, category (happy path, edge case, error), script (`generate`, `ingest`, `report`), preconditions, steps, expected result, status, result.
2. Write at least 10 cases that cover all three scripts and all three categories.
3. The error cases cover at least 3 distinct scenarios (e.g. timeout, auth error, empty response), so they match the error-handling criterion.
4. Error cases describe the behaviour we want (a logged error and a non-zero exit, never a silent stop), even where the code doesn't do this yet. Those cases are marked as waiting for the error-handling plan.
5. Set the status of every case to "open" and leave the result empty.

## Done when

- `TESTS.md` has at least 10 cases, with every category present and at least 3 distinct error scenarios.
- Every expected result can be checked by running a script and looking at its output, the log, the SQLite data or the report file.
- No code is changed.
