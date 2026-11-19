# Phase 12 database backup and restore

## Backup policy baseline (configure to business/legal requirements)

- Use managed MongoDB automated backups or scheduled `mongodump` backups with encryption and access control.
- Suggested starting point: daily full backup plus provider-supported point-in-time recovery / oplog capture. Validate RPO/RTO with the hospital operator; these are not guaranteed by the application.
- Retain backups according to a documented retention schedule approved by the data controller and legal/privacy team.
- Back up private upload/export storage separately, preserving the relationship between MongoDB metadata and file objects.
- Encrypt backup artifacts, restrict access to named operators, and record every restore/export action.
- Before schema/index changes, take a fresh backup and rehearse against a separate database.

## Example self-managed MongoDB commands

Use a protected shell and replace placeholders; never put credentials directly in shell history or documentation.

```bash
mongodump --uri="$MONGODB_BACKUP_URI" --archive="careflow-$(date +%F).archive" --gzip
```

Restore only to a separate recovery database first:

```bash
mongorestore --uri="$MONGODB_RESTORE_URI" --archive="careflow-YYYY-MM-DD.archive" --gzip --nsFrom='careflow.*' --nsTo='careflow_restore.*'
```

Confirm namespaces and restore options against the actual database name before execution. These commands are templates, not commands tested against a live CareFlow database in this environment.

## Restore drill

1. Create an isolated recovery database and storage directory.
2. Restore the selected backup.
3. Start a matching application release against the recovery database only.
4. Verify tenant counts, critical patient/appointment/clinical/finance records, indexes and file metadata.
5. Verify that referenced private files exist and can be read through authenticated application routes.
6. Run a small read-only smoke suite and compare business totals with the backup manifest.
7. Record measured recovery time and missing/corrupt objects; adjust RPO/RTO and backup cadence.
8. Destroy the isolated test environment according to secure disposal policy.

## Rollback cautions

- Never restore over production as an exploratory test.
- Preserve an incident-time backup before rollback.
- Reconcile payments, refunds, stock movements, dispensing and payroll events after the restore point with authoritative external records.
- Keep application and private-file backups time-aligned.

No live backup or restore drill was performed for this Phase 12 pass.
