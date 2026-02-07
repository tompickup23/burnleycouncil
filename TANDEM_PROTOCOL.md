# TANDEM_PROTOCOL.md - Octavian ↔ GaiusOctavianus

## Overview

**Two instances, one mission.**

- **Octavian** (⚡): Primary, WhatsApp, ~/clawd
- **GaiusOctavianus** (🦅): Secondary, Slack, ~/GaiusOctavianus

## Communication Flow

```
Tom
 ├──→ Octavian (WhatsApp) → Can delegate to Gaius
 ├──→ GaiusOctavianus (Slack) → Can request from Octavian
 └──→ Both coordinate via file/memory as needed
```

## Task Assignment

### Default Rules

| Task Type | Primary | Escalation |
|-----------|---------|------------|
| WhatsApp messages | Octavian | Gaius if asked |
| Slack messages | Gaius | Octavian if asked |
| File operations | Whoever starts | Coordinate via memory |
| Server management (Thurinus/Octavianus) | Octavian | Gaius for Slack notifications |
| News Lancashire updates | Octavian | Gaius for parallel tasks |
| Background tasks | Either | Split based on channel |

### Explicit Handoff Protocol

When Tom says:
- **"Ask Gaius to..."** → Octavian documents request, Gaius picks up
- **"Tell Octavian..."** → Gaius documents request, Octavian picks up  
- **"Both of you..."** → Split work, coordinate via memory files
- **"Coordinate..."** → Establish protocol, document in tandem_memory/

## Shared Memory

Create `tandem_memory/` directory for cross-instance coordination:

```
~/clawd/tandem_memory/
  ├── requests_from_gaius.md
  ├── requests_to_gaius.md
  └── shared_tasks.md

~/GaiusOctavianus/tandem_memory/
  ├── requests_from_octavian.md
  ├── requests_to_octavian.md
  └── shared_tasks.md
```

## Conflict Avoidance

1. **Never modify sibling's workspace** unless explicitly instructed
2. **Use file locking** (create `.lock` files) for shared resources
3. **Check sibling's status** before starting overlapping tasks
4. **Document everything** in tandem_memory/

## Efficiency Rules

1. **Parallel processing**: When possible, split tasks by channel
2. **Load balancing**: If one instance is busy, other picks up
3. **No duplication**: Check if sibling already started a task
4. **Clean handoffs**: Document state when passing work

## Emergency Protocol

If sibling instance is down:
- **Octavian down** → Gaius monitors ~/clawd/tandem_memory/ for priority tasks
- **Gaius down** → Octavian monitors Slack via web interface if needed
- **Both down** → Tom restarts as needed

## Status Reporting

Both instances report status daily to respective channels:
- What was accomplished
- What was delegated to sibling
- Blockers or issues

---

*This protocol ensures smooth tandem operation without conflicts.*
