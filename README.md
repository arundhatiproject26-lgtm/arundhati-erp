# Arundhati ERP

A staff ERP for Arundhati hospital that covers login, HR, biometric attendance, leave approval, and payslips.
It is built on Next.js App Router with Postgres (Kysely), AWS Cognito, Shadcn UI and TanStack Query.

## Portals

Each portal has its own login at `/login?portal=<role>`. One account can hold several roles and switch between them from the sidebar.

| Portal | Who | What they do |
|---|---|---|
| Staff | every employee (faculty and non-teaching) | see their own attendance, apply for leave, request regularization, view payslips |
| HOD | department heads | approve or reject leave from their department |
| Principal | principal | approve or reject leave the HOD has approved |
| Dean | dean | give the final leave approval |
| HR | HR office | manage employees and logins, upload biometric files, holidays, leave register and balances, regularizations, payslips |

### Leave chain

```
Staff applies → HOD → Principal → Dean → approved (visible in HR leave register)
```

- Any approver can reject a request; a reason is required.
- Staff can cancel a request while it is still awaiting approval.
- A HOD's own leave starts at the Principal.
- A Principal's own leave goes to the Dean.
- A Dean's own leave goes to the Principal, and the Principal's approval is final for it.
- Nobody can approve their own leave.
- HR sets leave balances per employee, per type, per year. A type with no allocation is uncapped.

### Attendance

HR uploads the biometric device's *Daily Attendance Report* (Excel) at **HR → Upload punches**. Status is then derived using the rules in `lib/hr-attendance.ts`:

- Late after 09:20; a half day after 09:50.
- Early out before 16:15; a half day before 15:30.
- 2 free late/early events per month (5 for a HOD).
- Sundays are weekly off.
- Holidays and approved leave are respected.

**These timings are carried over from a day-shift institution. Adjust the constants at the top of `lib/hr-attendance.ts` for hospital shifts.**

### Payroll

Each employee's salary structure is stored on their employee record. Staff view and print their payslips from the `payslips` table, and HR lists them by month. Payslip rows are loaded by your payroll/finance import, because this app does not generate them.

## Setup

1. Copy `.env.example` to `.env.local` and fill it in.
2. Create a Postgres database and apply the schema:
   ```bash
   psql "$DATABASE_URL" -f sql/schema.sql
   ```
3. Configure AWS Cognito:
   - Create a user pool with email as the username.
   - Create an app client with **ALLOW_USER_PASSWORD_AUTH** and **ALLOW_REFRESH_TOKEN_AUTH** and **no client secret**.
   - The server needs AWS credentials allowed to call `AdminCreateUser`, `AdminSetUserPassword` and `AdminGetUser` on that pool. HR uses these to create logins.
4. Bootstrap the first HR user. The SQL is at the bottom of `sql/schema.sql`.
5. Run the app:
   ```bash
   npm install
   npm run dev       # http://localhost:3000
   ```

From the HR portal you can then:
- add employees;
- create their logins (temporary password; they set their own at first sign-in);
- grant HOD / Principal / Dean / HR access.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run typecheck  # route type generation + tsc
npm run lint       # eslint
npm run check      # self-checks for the leave chain and attendance rules
```
