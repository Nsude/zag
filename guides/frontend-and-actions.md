# Frontend and Actions Guide

This guide explains how the user interface works and how it connects to the backend actions.

## 1. Main Page UI
**File:** `app/page.tsx`

The main page is a React Client Component (`'use client'`).

### State Management
- `scanning`: Boolean, true while a scan is in progress.
- `page`: Number, current pagination page (default 1).
- `status`: Object, tracks sending status per company (e.g., `{ 'domain.com': 'Sending...' }`).

### Data Fetching
- **Companies:** `useQuery(api.companies.list, { page })`
    - Fetches the list of companies for the current page.
    - Updates automatically when data changes in Convex.
- **Total Count:** `useQuery(api.companies.count)`
    - Used for pagination and conditional UI states.

## 2. Actions & Mutations

### Scanning
- **Trigger:** "Start Scan" button or Refresh icon.
- **Action:** `api.scan.run`
- **UI Logic:**
    - Buttons are conditionally disabled/faded based on `totalCount` and `scanning` state.
    - Shows "Scanning..." text or spinning icon during execution.

### Sending Emails
- **Trigger:** "Approve & Send" button.
- **Action:** `api.email.send`
- **Process:**
    1.  Checks if already sent.
    2.  Sets local status to 'Sending...'.
    3.  Extracts "To" (first email) and "CC" (rest of emails).
    4.  Calls `sendEmailAction` with subject, body, etc.
    5.  **On Success:**
        - Sets local status to 'Sent'.
        - Calls `api.companies.markContacted` to update database status.

### Managing Companies
- **Update Draft:** `api.companies.updateDraft`
    - Triggered `onChange` of the textarea.
    - Updates the draft in real-time in the database.
- **Blacklist:** `api.companies.blacklist`
    - Sets status to 'Blacklisted'.
    - Removes company from the main list (filtered out by `list` query).

## 3. Email Sending Backend
**File:** `convex/email.ts`

- Uses `nodemailer` to send emails.
- **Configuration:** Reads SMTP settings from environment variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- **Action:** `send`
    - Validates SMTP config.
    - Creates transporter.
    - Sends email with HTML body.
    - Returns message ID on success.
