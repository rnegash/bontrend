# GOALS.md: Bontrend

End criteria for the whole project, from the course brief "KI Automatisierung, Woche 4, Tag 1" (Modul 4 acceptance criteria). Every daily plan works toward these. Required criteria come before bonus criteria.

## Timeline

- Week 4: Mon briefing and architecture, Tue build prototype, Wed extend prototype and testing, Thu errors and monitoring, Fri interim presentation
- Week 5: Mon quality assurance, Tue performance and costs, Wed documentation and presentation, Thu and Fri presentation days
- Final deliverable: a 10 to 15 minute presentation with live demo at the end of week 5

## Target workflow

The scripts should run as one triggered workflow instead of by hand:

1. **Trigger:** a photo of a receipt is uploaded, for example to a Google Drive folder or to a Telegram bot.
2. **Ingest:** the upload starts `ingest`, which reads the receipt from the image and stores it.
3. **Report:** a finished ingest starts `report`, which writes a new trend report.

Open questions: which trigger to use (Google Drive or Telegram), how the report reaches the user, and reading receipts from images (vision extraction), which `CLAUDE.md` currently lists as out of scope.

## Required criteria (needed to pass)

**Functionality**

- A complete, working workflow with a clear use case
- At least 2 different APIs or data sources connected
- Data is transformed between steps, not just passed through

**Error handling and robustness**

- At least 3 error scenarios handled (e.g. timeout, auth error, empty response)
- Try/catch or fallback logic implemented
- The workflow must not die silently on an error

**Testing**

- A test table with at least 10 test cases
- Coverage: happy path, edge cases, error scenarios
- All test cases run and the results documented

**Monitoring and versioning**

- Logging at the critical points of the workflow
- At least one versioned export file of the workflow

**Documentation**

- Architecture diagram (workflow overview)
- API overview: which APIs, which auth method, which endpoints
- Known limitations listed

**Presentation**

- 10 to 15 minutes including questions
- The live demo must work

## Bonus criteria

- Modular structure with sub-workflows
- Alerting on errors (e.g. Slack or email notification)
- Cost calculation per workflow run
- Performance optimization documented (before and after)
