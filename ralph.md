# Ralph Enhancement: NTM Integration

## Overview

Enhance the ralph script to work with existing Claude Code instances managed by NTM (Named Tmux Manager) instead of spawning new headless instances. This enables multi-agent parallel processing, session persistence, and real-time progress monitoring.

## Current State

### Ralph Script (`ralph.sh`)
- **Current workflow**: Sequential processing using `claude --dangerously-skip-permissions`
- **Limitations**: Stateless, single-agent, no visibility
- **Memory allocation**: 32GB per instance via `NODE_OPTIONS`

### NTM System Status
- **Version**: 1.5.0 installed at `/usr/local/bin/ntm`
- **Active session**: `hypermark` with 3 Claude agents + 2 user panes
- **Capabilities**: Smart routing, activity monitoring, session persistence

### Available Work
- **BD daemon**: Running with 44 tracked issues
- **Ready beads**: 5 currently available via `bd ready --json`

## Enhancement Design

### 1. Session Detection
```bash
check_ntm_session() {
    local session_name="$1"

    # Check if session exists
    if ! ntm list --json | jq -e ".[] | select(.name == \"$session_name\")" > /dev/null 2>&1; then
        return 1  # Session doesn't exist
    fi

    # Check for idle Claude agents
    local idle_agents=$(ntm --robot-status | jq -r \
        ".sessions.\"$session_name\".panes[] | select(.agent_type == \"claude\" and (.state == \"WAITING\" or .state == \"IDLE\")) | .pane_id" | wc -l)

    if [ "$idle_agents" -gt 0 ]; then
        return 0  # Has idle agents
    else
        return 2  # Session exists but all agents busy
    fi
}
```

### 2. Work Distribution Strategy
```bash
distribute_work() {
    local bead_id="$1"
    local bead_title="$2"
    local prompt="Work on bead $bead_id: $bead_title"

    # Strategy 1: Use existing hypermark session (preferred)
    if check_ntm_session "hypermark"; then
        echo "Sending to existing hypermark session (smart routing)"
        ntm send hypermark --smart "$prompt"
        return $?
    fi

    # Strategy 2: Create dedicated ralph session
    if command -v ntm > /dev/null 2>&1; then
        echo "Creating dedicated ralph session"
        ntm spawn "ralph-$bead_id" --cc=1 --no-user --prompt="$prompt"
        return $?
    fi

    # Strategy 3: Fallback to current behavior
    echo "Fallback: Using headless Claude Code"
    NODE_OPTIONS="--max-old-space-size=32768" \
        claude --dangerously-skip-permissions "$prompt"
    return $?
}
```

### 3. Progress Monitoring
```bash
wait_for_completion() {
    local session_name="$1"
    local bead_id="$2"
    local timeout="${3:-600}"  # Default 10 minutes

    echo "Monitoring progress for bead $bead_id..."

    # Use NTM's intelligent waiting
    if ntm wait "$session_name" --until=idle --timeout="${timeout}s" --poll-interval=5; then
        echo "✓ Bead $bead_id completed successfully"
        return 0
    else
        local exit_code=$?
        case $exit_code in
            1) echo "⚠ Timeout waiting for bead $bead_id completion" ;;
            2) echo "✗ Error in session $session_name" ;;
            3) echo "✗ Agent error while processing bead $bead_id" ;;
            *) echo "✗ Unknown error (code: $exit_code)" ;;
        esac
        return $exit_code
    fi
}
```

### 4. Enhanced Main Loop
```bash
main_loop() {
    local max_iterations="$1"
    local concurrent_limit="${CONCURRENT_LIMIT:-3}"
    local iteration=1
    local active_sessions=()

    echo "🚀 Starting enhanced Ralph with NTM integration"
    echo "Max iterations: $max_iterations, Concurrent limit: $concurrent_limit"

    while [ $iteration -le $max_iterations ]; do
        # Get ready work
        local bead_json=$(bd ready --limit $concurrent_limit --json)
        local bead_count=$(echo "$bead_json" | jq length)

        if [ "$bead_count" -eq 0 ]; then
            echo "📭 No more ready beads. Ralph's work is done!"
            break
        fi

        echo "🔍 Found $bead_count ready bead(s) for iteration $iteration"

        # Process each bead
        for i in $(seq 0 $((bead_count - 1))); do
            local bead_id=$(echo "$bead_json" | jq -r ".[$i].id")
            local bead_title=$(echo "$bead_json" | jq -r ".[$i].title")

            echo "📋 Processing bead $bead_id: $bead_title"

            # Distribute work
            if distribute_work "$bead_id" "$bead_title"; then
                # Determine session for monitoring
                local session_name
                if check_ntm_session "hypermark" >/dev/null 2>&1; then
                    session_name="hypermark"
                else
                    session_name="ralph-$bead_id"
                fi

                active_sessions+=("$session_name:$bead_id")
                echo "✓ Work distributed to session: $session_name"
            else
                echo "✗ Failed to distribute work for bead $bead_id"
            fi
        done

        # Wait for all active work to complete
        for session_info in "${active_sessions[@]}"; do
            local session_name="${session_info%:*}"
            local bead_id="${session_info#*:}"

            wait_for_completion "$session_name" "$bead_id" "$TIMEOUT"
        done

        # Clear active sessions for next iteration
        active_sessions=()
        iteration=$((iteration + 1))

        sleep 1
    done

    echo "🎉 Ralph completed $((iteration - 1)) iterations"
}
```

### 5. Session Management & Cleanup
```bash
cleanup_sessions() {
    # Clean up temporary ralph sessions
    for session in $(ntm list --json 2>/dev/null | jq -r '.[] | select(.name | startswith("ralph-")) | .name' 2>/dev/null || true); do
        echo "Cleaning up session: $session"
        ntm kill "$session" 2>/dev/null || true
    done
}

# Trap for graceful cleanup
trap cleanup_sessions EXIT
```

### 6. Enhanced CLI Interface
```bash
usage() {
    cat << EOF
Usage: $0 [OPTIONS] [MAX_ITERATIONS]

Enhanced Ralph with NTM integration for multi-agent parallel processing.

OPTIONS:
    -s, --session NAME    Use specific NTM session (default: hypermark)
    -c, --concurrent N    Max concurrent beads (default: 3)
    -t, --timeout N       Timeout per bead in seconds (default: 600)
    -m, --monitor         Show real-time progress monitoring
    -d, --dry-run         Show what would be done without executing
    -h, --help            Show this help

EXAMPLES:
    $0                    # Process 1 iteration using default session
    $0 5                  # Process up to 5 iterations
    $0 -c 2 -t 300 10     # Max 2 concurrent, 5min timeout, 10 iterations
    $0 --monitor          # Show real-time agent activity

MONITORING:
    During execution, you can check progress with:
    - ntm activity hypermark --watch    # Real-time agent monitoring
    - ntm attach hypermark              # Attach to session interactively
    - ntm --robot-status               # Full session status (JSON)
    - ntm --robot-terse                # Compact status line

EOF
}

# Parse arguments
CONCURRENT_LIMIT=3
TIMEOUT=600
SESSION_NAME="hypermark"
MONITOR=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--session)
            SESSION_NAME="$2"
            shift 2
            ;;
        -c|--concurrent)
            CONCURRENT_LIMIT="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -m|--monitor)
            MONITOR=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            MAX_ITERATIONS="$1"
            shift
            ;;
    esac
done
```

## Key Benefits

### Performance Improvements
| Aspect | Current Ralph | Enhanced Ralph |
|--------|--------------|----------------|
| **Parallelism** | 1 bead sequentially | Up to 3 beads concurrently |
| **Memory Usage** | 32GB per new process | Reuse existing sessions |
| **Startup Time** | Cold start each iteration | Warm sessions ready |
| **Context** | Lost between iterations | Persistent across runs |

### Operational Benefits
- **Real-time monitoring**: `ntm activity hypermark --watch`
- **Interactive check-in**: `ntm attach hypermark` to see progress
- **Smart load balancing**: NTM automatically routes to least busy agent
- **Error resilience**: Individual bead failures don't affect others
- **Graceful degradation**: Falls back to current behavior if NTM unavailable

## Usage Patterns

### Basic Usage (Unchanged)
```bash
./ralph.sh 5    # Process up to 5 iterations
```

### Enhanced Usage
```bash
# Monitor real-time progress
./ralph.sh --monitor 10

# Higher concurrency with shorter timeout
./ralph.sh --concurrent 5 --timeout 300 20

# Use different session
./ralph.sh --session myproject 3

# Dry run to see what would happen
./ralph.sh --dry-run 1
```

### Monitoring Commands
```bash
# Real-time agent activity dashboard
ntm activity hypermark --watch

# Check current status
ntm --robot-terse

# Attach to session interactively
ntm attach hypermark

# See full session details
ntm --robot-status | jq '.sessions.hypermark'
```

## Implementation Notes

### Error Handling
- Each distribution strategy has fallback to next level
- Timeouts prevent indefinite hanging
- Session cleanup ensures no orphaned processes
- Exit codes indicate specific failure types

### Concurrency Control
- `CONCURRENT_LIMIT` prevents resource exhaustion
- Active session tracking ensures proper cleanup
- Load balancing via NTM's `--smart` routing

### Backward Compatibility
- Maintains original command-line interface
- Falls back to headless mode if NTM unavailable
- Preserves existing memory allocation settings
- Same error handling behavior for bead processing

## Testing Strategy

### Unit Tests
1. Session detection logic with various NTM states
2. Work distribution strategy fallback chain
3. Progress monitoring timeout handling
4. Argument parsing and validation

### Integration Tests
1. End-to-end workflow with active hypermark session
2. Concurrent processing of multiple beads
3. Session cleanup after completion/interruption
4. Fallback behavior when NTM unavailable

### Performance Tests
1. Throughput comparison: beads processed per hour
2. Resource usage: memory and CPU efficiency
3. Response time: time to start processing vs current
4. Scalability: behavior with increasing concurrency limits

## Risk Mitigation

### Compatibility Risks
- **Mitigation**: Fallback chain ensures current behavior preserved
- **Testing**: Verify fallback works when NTM unavailable

### Resource Risks
- **Mitigation**: Configurable concurrency limits and timeouts
- **Monitoring**: Real-time resource usage via `ntm activity`

### Session Management Risks
- **Mitigation**: Cleanup traps and error isolation
- **Recovery**: Temporary sessions automatically cleaned up

## Future Enhancements

### Phase 2 Possibilities
- **Bead priority routing**: Route high-priority beads to fastest agents
- **Cross-session load balancing**: Distribute across multiple NTM sessions
- **Progress persistence**: Resume interrupted work across ralph restarts
- **Advanced monitoring**: Web dashboard via NTM's HTTP API
- **Auto-scaling**: Dynamic session creation based on work queue depth

### Integration Opportunities
- **CASS integration**: Avoid duplicate work using NTM's CASS features
- **BD daemon events**: React to real-time bead status changes
- **Git workflow**: Automatic branch creation per bead processing
- **Notification system**: Alert on completion/errors via webhook