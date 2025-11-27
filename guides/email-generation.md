# Email Generation Guide

This guide explains how the application uses AI to find key people and generate personalized emails.

## 1. Finding Key People
**File:** `convex/scan.ts`
**Function:** `getKeyPeople`

This function uses the **Gemini 2.0 Flash** model to find executives.

- **Input:** Company Name, Website URL.
- **Prompt:** Asks Gemini to browse the website and find:
    1.  Founders/Co-founders
    2.  CEO
    3.  CTO
    4.  COO (fallback)
- **Output:** JSON array of objects: `[{ name: "Name", role: "Role" }]`.
- **Handling Single Names:** The code handles cases where Gemini returns only a first name (e.g., "John") by treating it as a valid name for email generation.

## 2. Generating Email Addresses
**File:** `convex/utils.ts` & `convex/scan.ts`

### Permutations
**Function:** `generateEmailPermutations`
- Currently configured to generate only `firstname@domain`.
- *Note:* Can be expanded to include `first.last@domain`, etc., by modifying `convex/utils.ts`.

### Collection Logic
In `convex/scan.ts`:
- Iterates through **all** found key people (limited to top 4).
- Generates emails for each person.
- **Result:** A single flat array of emails (e.g., `['founder1@domain.com', 'founder2@domain.com']`).
- **UI Usage:** The first email is used as "To", and the rest are used as "CC".

## 3. Generating Point of View (POV)
**File:** `convex/scan.ts`
**Function:** `generatePOV`

This function uses Gemini to create a personalized sentence showing understanding of the company.

- **Input:** Company Name, Description.
- **Prompt:** Asks for a single "point of view" sentence that demonstrates value proposition understanding.
- **Constraint:** Must NOT include the phrase "You've built something incredible with..." (as that is part of the static template).

## 4. Assembling the Draft
**File:** `convex/scan.ts`

The final email draft is assembled using a template string:

1.  **Greeting:**
    - Dynamically generated based on names found.
    - 1 person: "Hi [Name]"
    - 2 people: "Hi [Name] and Hi [Name]"
    - 3+ people: "Hi [Name], Hi [Name], and Hi [Name]"
    - Fallback: "Hi there"
2.  **Body:**
    - Static intro: "I’m Meshach..."
    - **Dynamic POV:** "You’ve built something incredible with ${companyName}. ${pov}"
    - Static value prop: "From what I can tell..."
    - **Closing:** "There's a version of ${companyName}... I'd love to show you what that could look like."
    - **Calendar Link:** "Here's my calendar..."
3.  **Signature:** Static signature with GitHub/LinkedIn links.

The assembled draft is stored in the `emailDraft` field of the company record.
