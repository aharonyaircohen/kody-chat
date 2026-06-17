Create-on-demand workflows. Use these when the user has approved a plan and wants the artifact created.

**Skills:**
- `create-issue` — research → gap-closing → show body → call the matching create_* / report_bug
- `create-duty` — research → gap-closing → show profile+body → call `create_or_update_kody_duty`
- `create-staff` — research → gap-closing → show body → call `create_kody_staff`

**Hard rules:** never call `create_*` / `report_bug` on the first turn. Show the title + body once for approval, then call the tool. `additionalContext` MUST end with **Research notes**.
