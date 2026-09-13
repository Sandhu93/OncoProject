# Operations preparation

## Environment boundary

Local Compose binds published ports to loopback. It provides a development database and optional HTTP application preview. It does not configure hospital TLS, directory authentication, encryption at rest, remote monitoring, device management or production backups.

Before any patient deployment, hospital IT must assign an operational owner, provision approved storage and networking, issue certificates, define account lifecycle and confirm permitted backup/mobile/push data locations.

## Deployment sequence

1. Build and verify a tagged release using synthetic test data.
2. Provision separate database migrator/application roles; the runtime role must not own schema or bypass history protection.
3. Create and verify a backup before schema changes.
4. Apply checksummed migrations through the controlled migrator identity.
5. Deploy API/web behind HTTPS; expose the database only to approved application/administration hosts.
6. Verify liveness, database readiness, authenticated role flows and the approved workflow configuration.
7. Record deployment owner, version, migration list and rollback/recovery procedure.

The current readiness route verifies connectivity and initial schema presence. It does not certify workflow approval, staff access, backups or clinical readiness. Extend it as infrastructure dependencies are added, keeping public health output free of connection strings and patient data.

## Backup and recovery milestone

Implement scheduled PostgreSQL backups to approved encrypted storage, retention and failure alerts with hospital IT. A copied volume or successful backup command alone is not restore evidence. Restore into a separate clean database, apply the relevant app version, verify chart/history/booking consistency and measure elapsed recovery time. Restore processes and encryption keys must be available during a server outage.

The initial planning proposal is a four-hour recovery target and at most 24 hours of lost data with daily backups. These are not configured guarantees. If this loss window is unacceptable, add transaction-log recovery or more frequent backups and rehearse the revised target.

## Monitoring milestone

Monitor process health, readiness, disk space, database connectivity, backup age/failure, outbox backlog and stalled worker execution. Log request IDs and stable error codes rather than patient details, passwords, tokens or request bodies. Route technical alerts only to approved recipients.

## Downtime and release gates

Prepare a paper fallback and controlled reconciliation of actions entered during downtime. The system is not ready for real patient use until authentication, complete workflow commands, staff acceptance, TLS/storage controls and recovery rehearsal are finished. See `docs/development/backlog.md` for the implementation work.
