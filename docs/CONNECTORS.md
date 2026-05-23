# DataBridge Connectors Guide

## Connector Overview

| Adapter ID | System | Transport | Auth | Incremental |
|------------|--------|-----------|------|-------------|
| `sits-oracle` | SITS:Vision | Oracle JDBC | DB credentials | `LAST_UPD` cursor |
| `sits-api` | SITS:Vision | SOAP/REST (e:Vision) | WS-Security / token | `LAST_UPD` cursor |
| `sits-file` | SITS exports | SFTP / S3 / upload | File credentials | File timestamp + row hash |
| `banner-ethos` | Ellucian Banner | Ethos REST | Bearer (JWT) | `If-Modified-Since` |
| `banner-oracle` | Ellucian Banner | Oracle JDBC | DB credentials | `ACTIVITY_DATE` cursor |
| `banner-file` | Banner ODS | SFTP / S3 | File credentials | File timestamp + row hash |
| `workday-raas` | Workday Student | RaaS REST / SOAP | ISU OAuth 2.0 | `As_Of_Effective_Date` |
| `sjms5` | SJMS-5 | Postgres direct | DB credentials | `updatedAt` cursor |
| `generic-csv` | Any | File upload | None | File timestamp |
| `generic-jdbc` | Any SQL | JDBC | DB credentials | Configurable cursor |

## sits-oracle Configuration

```env
CONN_SITS_ORACLE_HOST=oracle.institution.ac.uk
CONN_SITS_ORACLE_PORT=1521
CONN_SITS_ORACLE_SID=SITS
CONN_SITS_ORACLE_USER=DATABRIDGE_RO
CONN_SITS_ORACLE_PASSWORD=<vault:sits-oracle-password>
CONN_SITS_ORACLE_CONCURRENCY=4
CONN_SITS_ORACLE_STATEMENT_TIMEOUT_S=1800
```

Required Oracle grants:
```sql
GRANT SELECT ON SITS.MEN_ENT TO DATABRIDGE_RO;
GRANT SELECT ON SITS.MEN_FLD TO DATABRIDGE_RO;
GRANT SELECT ON SITS.MEN_UDF TO DATABRIDGE_RO;
GRANT SELECT ON SITS.INS_STU TO DATABRIDGE_RO;
GRANT SELECT ON SITS.INS_SPR TO DATABRIDGE_RO;
GRANT SELECT ON SITS.INS_SCE TO DATABRIDGE_RO;
GRANT SELECT ON SITS.INS_PRG TO DATABRIDGE_RO;
GRANT SELECT ON SITS.INS_MOD TO DATABRIDGE_RO;
GRANT SELECT ON SITS.INS_CRS TO DATABRIDGE_RO;
-- ... (full grant script in scripts/sits-oracle-grants.sql)
```

## banner-ethos Configuration

```env
CONN_BANNER_ETHOS_API_KEY=<vault:banner-ethos-api-key>
CONN_BANNER_ETHOS_ENDPOINT=https://integrate.elluciancloud.com
CONN_BANNER_ETHOS_RATE_LIMIT_RPS=8
```

## workday-raas Configuration

```env
CONN_WORKDAY_TENANT=myinstitution
CONN_WORKDAY_ISU_USERNAME=<vault:workday-isu-user>
CONN_WORKDAY_ISU_PASSWORD=<vault:workday-isu-password>
CONN_WORKDAY_RAAS_ENDPOINT=https://services1.myworkday.com/ccx/service/customreport2
CONN_WORKDAY_RATE_LIMIT_RPS=2
```

Required RaaS reports (template provided by DataBridge):
- `DB_Students`
- `DB_AcademicRecords`
- `DB_ProgramsOfStudy`
- `DB_CourseSections`
- `DB_Registrations`
- `DB_AcademicPeriods`

## In-VPC Connector Deployment

For institutions that cannot expose Oracle credentials to a SaaS host:

```bash
# Pull the connector image
docker pull ghcr.io/future-horizons-education/databridge-connector:latest

# Run with env config
docker run -d \
  --name databridge-connector \
  -e CONNECTOR_TENANT_ID=<your-tenant-id> \
  -e CONNECTOR_API_KEY=<vault:connector-api-key> \
  -e CONNECTOR_DATABRIDGE_ENDPOINT=https://api.databridge.fhe.ac.uk \
  -e SITS_ORACLE_HOST=oracle.institution.ac.uk \
  -e SITS_ORACLE_USER=DATABRIDGE_RO \
  -e SITS_ORACLE_PASSWORD=<password> \
  ghcr.io/future-horizons-education/databridge-connector:latest
```

The connector pod never receives write credentials. It runs adapters locally,
redacts PII from profiles, and pushes only lineage metadata to the cloud tenant
over outbound mTLS. The SaaS side never holds raw Oracle rows in this mode.
