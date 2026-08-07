# TaskNotes - Unreleased

<!--

**Added** for new features.
**Changed** for changes in existing functionality.
**Deprecated** for soon-to-be removed features.
**Removed** for now removed features.
**Fixed** for any bug fixes.
**Security** in case of vulnerabilities.

Always acknowledge contributors and those who report issues.

Example:

```
## Fixed

- Fixed Kanban tag clicks opening tag search instead of the task editor; clicking anywhere on a Kanban card now opens the task editor.
- (#768) Fixed calendar view appearing empty in week and day views due to invalid time configuration values
  - Added time validation in settings UI with proper error messages and debouncing
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

When a change has user-facing documentation, include a canonical tasknotes.dev link:

```
## Added

- Added materialized occurrence notes for recurring tasks. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#materialized-occurrence-notes) for setup and calendar behavior.
```

-->

## Added

- Added a compact active-task control in the top-right of Obsidian with live elapsed time and an action to end the task.
- Added an optional Kanban toolbar that combines task search with scheduled, created, or completed date filters for this week, last week, all tasks, or a custom date range. Scheduled date is the default.
- Added a generated time statistics Base with a unified day, week, month, and year dashboard for totals, trends, task rankings, tag distribution, and recent time entries. It is available from a new ribbon shortcut and the command palette.

## Changed

- Task creation dialogs now create an untitled task as soon as they open and autosave every subsequent edit. The bottom Create task action has been removed, the header includes a direct Open note action, and closing or opening the note flushes pending title, details, property, relationship, and subtask changes first.
- Time statistics now separates cumulative task time from total time, with overlapping task timers counted only once in the total across day, week, month, and year views.
- Rebuilt the task creation and edit dialogs as a unified single-column task sheet with a compact icon-led property layout. Status, priority, scheduled time, and tags appear first; a control directly below the property list reveals only the remaining properties, while the full-height Markdown details stay visible and can be focused from anywhere in their blank region. Natural-language task capture now fills the form automatically with a faster, change-aware debounce, including Chinese phrases such as “明天下午三点.” Edit dialogs now save continuously like a normal note, place the icon-labeled “Open note” action beside the top close control, and no longer require a bottom action bar. The modal field settings now include status, priority, dates, recurrence, reminders, and edit-mode time tracking.
- Active task controls now separate stopping from completing: the blue Stop action ends timing and returns the task to its configured pending status, while the green Complete action ends timing and completes the task.
- Unified task date entry points around a compact visual calendar with today, tomorrow, Friday, and Sunday shortcuts while retaining optional time selection and natural-language date entry without unused modal space.
- Refreshed the custom Bases Kanban view with soft color-coded columns, cleaner standalone task cards, collapsible and persistently reorderable swimlanes, per-view swimlane visibility controls, and labeled creation actions.
- Kanban scheduled dates can now be changed directly from each card with quick choices for today, tomorrow, Friday, Sunday, and a compact calendar. Custom date filters now use a visual range calendar with shortcuts for this month, last month, and the recent three months.
- Kanban views can now use a centered fixed width or full width with configurable side margins. The floating active-task control can be dragged anywhere in the workspace and remembers its position.
- Kanban task creation now inherits the current column and swimlane values for tags and other writable note properties, and the task card menu includes a direct delete action.
- Task note header cards now keep the start/end task action visible and show a compact in-progress label while a task is active.
- Refined the time statistics dashboard to match the day timeline, monthly heatmap, tag-stacked period chart with immediate tag breakdowns, full task rankings, distribution, and date-grouped record layout across day, week, month, and year views. Rankings now appear above time records, all recorded tasks and tags remain visible, long summary values show their full text on hover, and longer durations automatically switch from hours to days and months. Time-entry tags remain fully visible without adding card borders to each row.
- Task cards now distinguish the saved in-progress status from an active timer: status-only cards show the configured status label, while actively timed cards show a dedicated tracking label.
- Starting a timer now moves the task to the configured in-progress status, and moving a task into that status starts its timer.
- Moving a task out of the configured in-progress status now stops its active timer and refreshes the floating active-task control. Existing active timers attached to another status are reconciled when the plugin loads.
- Task system properties now show created and modified timestamps in local time and summarize time entries instead of displaying raw timestamp and object data. Stored values retain their timezone information.
- Newly created property-identified tasks now retain an empty `tags` property, making it available for direct editing in Obsidian even when no tag was chosen during creation.
- TaskNotes Base view names, configuration labels, dropdown values, and placeholders now follow the selected interface language instead of displaying hard-coded English text.
- Generated TaskNotes type contracts now include configured natural-language
  capture triggers, allowing compatible clients to offer the same field
  suggestions.
- Rebuilt the TaskNotes documentation as a v5-ready, source-generated site with
  reorganized navigation, full-text search, mobile and accessibility
  improvements, and references generated from the current commands, settings,
  compatibility metadata, HTTP routes, and default Bases. Added practical
  guides for adopting TaskNotes in an existing vault, mobile use, custom Bases,
  and backup and recovery. See the
  [TaskNotes documentation](https://tasknotes.dev/).

## Fixed

- Task card progress bars now count linked subtask notes and their configured completion statuses instead of Markdown checkboxes in the parent note.
- Fixed tasks created or moved into the in-progress Kanban column through embedded Bases, metadata-only updates, or other task entry points not reliably starting time tracking and showing the floating active-task control. Duplicate update events are now reconciled once, and user-facing stop controls also return the task to its pending status so the saved status and floating timer cannot drift apart.
- Opening a task note from the edit dialog now reuses the active tab and dismisses the dialog before Markdown and embedded queries finish rendering, while still saving pending edits first.
- Fixed continuous edit-modal autosave errors after renaming a task stored in the vault root; root filenames now keep canonical paths, and previously generated leading-slash paths are recovered automatically.
- Fixed task modal tag suggestions only searching tags already used by tasks; suggestions now include hierarchical tags from the entire vault, matching Markdown tag completion.
- Fixed Kanban drag-and-drop sometimes moving a card visually without saving its new status, including when the optimistic card position no longer matched the status still stored in the task file.
- Fixed the Kanban custom date range control so applying a range filters the board reliably and dismissing the dialog no longer leaves the control waiting for a result.
- Fixed the task-note card and floating active-task control using different end-task behavior. Both now stop the timer before completing the task, and restarting a task immediately restores the floating control.
- Fixed the task modal fields settings page displaying hard-coded English text when the interface language is Chinese.
- Fixed tasks created from the Relationships widget being detached from the current task; they now use the current task as their parent. Subtasks created from either the Relationships widget or task command menu always copy the parent task's complete tag list.
- Fixed saved Kanban status orders creating a duplicate column when a configured status value used different capitalization.
- Fixed hidden Kanban swimlanes reappearing as empty rows when they were still present in a saved swimlane order.
- Fixed tag-based Kanban swimlanes falling into the `None` row when current Base properties had newer tag values than the cached task data.
- Fixed duplicate instant-convert icons appearing beside checkbox tasks when editor services were initialized more than once.
- (#1929) Fixed the bottom Relationships widget moving over images and other embedded content after Live Preview reflowed the note.
    - Thanks to @rchaklashiya for the original report and embed follow-up.
