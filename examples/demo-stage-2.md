## Migration plan
Three steps over two weeks, with a way back at every step.

| Step | What happens | Way back |
|---|---|---|
| 1 | Create the managed Postgres and load a copy of the data | Drop the new database |
| 2 | Run staging against Postgres for a week | Point staging back |
| 3 | Switch production at night; keep the old store read-only for a week | Switch back |

### M1: When do we switch production?
- (*) A weeknight after the monthly invoices (recommended): lowest traffic
- ( ) A Saturday morning
- ( ) Right after staging passes
