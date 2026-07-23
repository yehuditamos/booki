# FlowList - Product Requirements Document (PRD)

Version 1.3

---

# Project Name

FlowList

---

# Vision

FlowList is a customer service task management system.

Its purpose is not to manage messages.

Its purpose is to ensure that every customer service request becomes a structured task that is completed from beginning to end without being forgotten.

The system replaces WhatsApp chaos with a simple, structured workflow.

---

# MVP Goal

Build a system that a business owner can use every day from the very first version.

No external integrations are required.

No AI automation is required.

No BoostApp integration is required.

The system itself must completely organize customer service work.

---

# Current Target User

The first version is built for a single business owner.

However, the architecture MUST support multiple businesses from day one.

The current owner must use exactly the same product that future customers will use.

No custom code for the current owner.

---

# Core Philosophy

FlowList is NOT a CRM.

FlowList is NOT a messaging platform.

FlowList is NOT a membership management system.

FlowList is a Customer Service Execution System.

---

# Project Rules

- Do not invent features.
- Do not guess requirements.
- Do not add functionality that is not described in this PRD.
- Stop and ask whenever requirements are unclear.
- Build only what is requested.

---

# Architecture

The system must support multiple businesses.

Each business owns an isolated Workspace.

Each Workspace contains:

- Customers
- Requests
- Dashboard
- Statistics
- Business Users

Data between businesses must always remain isolated.

---

# Customer Entry

Every business receives its own permanent URL.

Example:

serviceflow.app/mamafitness

Customers always enter through the business URL.

Customers never choose a business manually.

---

# Customer Identification

MVP does NOT require login.

Instead, customers identify themselves by entering:

- Full Name
- Mobile Phone Number

This information is used by the business owner to identify the customer in their existing management system.

---

# Customer Home

Title:

Customer Service Center

Categories:

❄️ Freeze Membership

❌ Cancel Membership

📅 Training Completion

❤️ Special Consideration

👤 Update Personal Details

💬 Other Request

📋 My Requests

These categories are fixed and must not be changed.

---

# Request Flow

Every request is completed through a step-by-step Wizard.

Never display one large form.

Each step should ask only one thing.

---

# Request Status

New

Viewed

In Progress

Waiting For Customer

Completed

Rejected

Closed

---

# Owner Dashboard

Home screen must display:

Good Morning, [Business Owner]

🔴 Urgent

🟠 Due Today

🟢 New

⚠️ Overdue

Main Button:

▶ Start Working

This layout is fixed.

---

# Work Mode

Pressing "Start Working" opens ONE task only.

Never display a long task list.

The owner works on one task.

After completion, automatically continue to the next task.

---

# Task Card

Each task displays:

Customer Name

Phone Number

Request Type

Request Date

Elapsed Time

Remaining SLA

Status

---

# Execution Checklist

A task is never completed by pressing "Done".

Every task must be completed through an Execution Checklist.

Example:

☐ Eligibility checked

☐ Action completed in management system

☐ Confirmation sent to customer

☐ Status updated

Only after every checklist item is completed may the task be closed.

This is a core principle of FlowList.

---

# Dashboard

Dashboard displays current month statistics.

From the first day of the month until today.

Required KPIs:

- New Requests
- Completed Requests
- Open Requests
- Overdue Requests
- Average Resolution Time
- Membership Freezes
- Membership Cancellations
- Special Consideration Requests
- On-Time Resolution Rate

---

# Notifications

Phase 1:

In-app notifications only.

Future versions:

Email

WhatsApp

Push Notifications

---

# Integrations

Do NOT integrate with BoostApp.

Do NOT integrate with any external software.

Business owners perform actions manually.

FlowList guarantees execution through the Execution Checklist.

---

# UI Principles

Minimal.

Fast.

Clean.

Every screen has exactly one purpose.

---

# Localization

FlowList is an Israeli product.

Hebrew is the PRIMARY language of the application.

All UI visible to end users must be written in natural, professional, right-to-left Hebrew. This includes:

- Page titles
- Buttons
- Labels
- Forms
- Validation messages
- Empty states
- Placeholders
- Navigation
- Dashboard
- Notifications
- Statuses
- Customer-facing screens
- Business owner screens

Internal code, variables, functions, database tables, API routes, and source code remain in English.

Only the user interface is Hebrew.

Technical identifiers that are inherently Latin/ASCII by nature of how the web works — a workspace's URL slug (e.g. `serviceflow.app/mamafitness`) and raw email addresses typed by the user — are not translated, since translating them would break their function. The labels and instructions around them are still Hebrew.

---

# Development Method

Build only one Sprint at a time.

Never continue before the current Sprint is approved.

**Every Sprint must end with:**

1. **Build** — the sprint's scope is implemented and compiles/builds cleanly.
2. **Verification** — the built functionality is actually exercised (not just type-checked) to confirm it behaves as intended.
3. **Summary** — files created, architecture decisions made, dependencies installed, and folder structure are reported.
4. **Open Questions** — anything unclear or requiring a decision before the next Sprint is listed explicitly.

The next Sprint may not begin until these four are delivered and the Sprint is explicitly approved.

---

# Sprint 1

Goal:

Build the project foundation.

Include:

- Workspace Architecture
- Authentication
- Database
- Routing
- Application Layout
- Navigation

Do NOT build requests.

Do NOT build Dashboard.

Do NOT build AI.

Do NOT build Notifications.

Only build the foundation.

**Status: Approved.** Retrofitted for Hebrew/RTL per the Localization section above, prior to Sprint 2.

---

# Sprint 2

Goal:

Build the complete customer request submission flow, so a customer can submit one Freeze Membership request from start to finish.

Include:

- Customer Service Center home screen (7 category cards)
- Freeze Membership request wizard (intro + 7 steps, warm/guided tone, progress indicator, back/continue navigation)
- Request database schema, designed so future request types don't require restructuring
- Placeholder screens for the other 5 categories
- My Requests lookup (by full name + phone, no auth)

Do NOT build Dashboard, owner task management, notifications, execution checklist, statistics, or any integrations.

**Status: Approved.**

---

# Sprint 3

Goal:

Build the complete request management experience for the business owner: view, filter, open, review, complete an execution checklist, and mark requests completed.

Include:

- Owner Requests list (cards, newest first, filters by status + type)
- 4-status lifecycle: NEW / IN_PROGRESS / COMPLETED / CANCELLED (Status kept strictly separate from any future Priority concept)
- Request Details page with full submitted answers
- Execution checklist (Freeze Membership), mandatory before a request can be marked COMPLETED
- Manual status control
- One real dashboard KPI: cancellation requests this month

Do NOT build notifications, WhatsApp, email, BoostApp integration, automatic status changes, SLA timers, AI, search, bulk actions, or editing/deleting requests.

**Status: Approved.**

---

# Sprint 4

Goal:

Transform the owner dashboard into an operational control center answering "what should I work on right now?"

Include:

- 4 clickable KPI cards (new / in progress / completed this week / cancellations this month)
- "דורש את תשומת ליבי" (Attention) section: all NEW then all IN_PROGRESS requests, oldest first
- "פעילות אחרונה" (Recent Activity) section: most recently completed requests, read-only
- Improved tiered Hebrew waiting-time display (hours / days / weeks), used consistently app-wide
- Polished, non-generic Hebrew empty states
- `Request.completedAt` field, so "completed this week" and completion dates are accurate

Do NOT build notifications, WhatsApp, email, BoostApp integration, AI, a Priority system, search, pagination, reports, or a calendar.

**Status: Approved.**

---

# Sprint 5

Goal:

Polish pass across the entire application — no new features, no business logic changes. Make FlowList feel like a production-ready commercial SaaS product.

Include:

- Shared UI primitives (Button, TextField, Checkbox) to fix inconsistency and duplication across every form
- Friendlier, non-blaming validation messages that explain how to fix the problem
- Warmer, honest empty-state copy throughout (ComingSoon, My Requests, dashboard)
- Responsive admin navigation (the sidebar was unusable on mobile; now collapses to a top bar + menu)
- Mobile layout fixes across every screen (touch targets, truncation, overflow)
- Visual grouping/hierarchy on the dashboard (bordered sections)
- Route-level loading skeletons for the admin section
- Accessibility pass: focus-visible rings everywhere, ARIA labels on filters, persistent (not just tooltip) explanation for the checklist-completion gate, removed a leftover unstyled dark-mode media query that would have broken contrast

Do NOT deploy. No business logic or workflow changes.

**Status: Built and verified, pending review.**

---

# Final Rule

Whenever requirements are unclear:

STOP.

Ask.

Never guess.
