#!/bin/bash

# Ralph: Enhanced Bead Processor with NTM Integration
# Processes beads using existing Claude Code instances managed by NTM (Named Tmux Manager)
# for multi-agent parallel processing, session persistence, and real-time progress monitoring.

set -euo pipefail

# Default configuration
CONCURRENT_LIMIT=3
TIMEOUT=600
SESSION_NAME="hypermark"
MONITOR=false
DRY_RUN=false
MAX_ITERATIONS=1

# ANSI colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Utility Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Session Detection
# ============================================================================

check_ntm_session() {
    local session_name="$1"

    # Check if ntm is available
    if ! command -v ntm > /dev/null 2>&1; then
        return 3  # NTM not installed
    fi

    # Check if session exists
    if ! ntm list --json 2>/dev/null | jq -e ".[] | select(.name == \"$session_name\")" > /dev/null 2>&1; then
        return 1  # Session doesn't exist
    fi

    # Check for idle Claude agents
    local idle_agents
    idle_agents=$(ntm --robot-status 2>/dev/null | jq -r \
        ".sessions.\"$session_name\".panes[] | select(.agent_type == \"claude\" and (.state == \"WAITING\" or .state == \"IDLE\")) | .pane_id" 2>/dev/null | wc -l || echo "0")

    if [ "$idle_agents" -gt 0 ]; then
        return 0  # Has idle agents
    else
        return 2  # Session exists but all agents busy
    fi
}

# ============================================================================
# Work Distribution Strategy
# ============================================================================

distribute_work() {
    local bead_id="$1"
    local bead_title="$2"
    local prompt_file="${3:-PROMPT.md}"

    # Build the prompt - read from PROMPT.md to get the standard workflow
    local prompt
    if [ -f "$prompt_file" ]; then
        prompt=$(cat "$prompt_file")
    else
        prompt="Work on bead $bead_id: $bead_title

Please:
1. Run \`bd update $bead_id --status in_progress\` to claim the bead
2. Study the bead description with \`bd show $bead_id\`
3. Implement the required changes
4. Commit your work
5. Close the bead with \`bd close $bead_id --reason \"Completed\"\`"
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would send to session: $SESSION_NAME"
        log_info "[DRY RUN] Bead: $bead_id - $bead_title"
        return 0
    fi

    # Strategy 1: Use existing session with smart routing (preferred)
    if check_ntm_session "$SESSION_NAME"; then
        log_info "Sending to existing $SESSION_NAME session (smart routing)"
        if ntm send "$SESSION_NAME" --smart "$prompt" 2>/dev/null; then
            return 0
        fi
        log_warn "Smart routing failed, trying direct send"
    fi

    # Strategy 2: Use existing session without smart routing
    local session_status=$?
    if [ $session_status -eq 2 ]; then
        # Session exists but all agents busy - wait and retry
        log_warn "All agents in $SESSION_NAME are busy, waiting..."
        sleep 5
        if ntm send "$SESSION_NAME" "$prompt" 2>/dev/null; then
            return 0
        fi
    fi

    # Strategy 3: Create dedicated ralph session for this bead
    if command -v ntm > /dev/null 2>&1; then
        log_info "Creating dedicated ralph-$bead_id session"
        if ntm spawn "ralph-$bead_id" --cc=1 --no-user --prompt="$prompt" 2>/dev/null; then
            return 0
        fi
        log_warn "Failed to create dedicated session"
    fi

    # Strategy 4: Fallback to current behavior - headless Claude Code
    log_info "Fallback: Using headless Claude Code"
    NODE_OPTIONS="--max-old-space-size=32768" \
        claude --dangerously-skip-permissions \
        --output-format=stream-json \
        --verbose \
        -p "$prompt"
    return $?
}

# ============================================================================
# Progress Monitoring
# ============================================================================

wait_for_completion() {
    local session_name="$1"
    local bead_id="$2"
    local timeout="${3:-$TIMEOUT}"

    log_info "Monitoring progress for bead $bead_id (timeout: ${timeout}s)..."

    # If NTM is available, use intelligent waiting
    if command -v ntm > /dev/null 2>&1; then
        if ntm wait "$session_name" --until=idle --timeout="${timeout}s" --poll-interval=5 2>/dev/null; then
            log_success "Bead $bead_id completed successfully"
            return 0
        else
            local exit_code=$?
            case $exit_code in
                1) log_warn "Timeout waiting for bead $bead_id completion" ;;
                2) log_error "Error in session $session_name" ;;
                3) log_error "Agent error while processing bead $bead_id" ;;
                *) log_error "Unknown error (code: $exit_code)" ;;
            esac
            return $exit_code
        fi
    fi

    # Fallback: simple polling for bead status
    local elapsed=0
    local poll_interval=10
    while [ $elapsed -lt "$timeout" ]; do
        # Check if bead is closed
        local bead_status
        bead_status=$(bd show "$bead_id" --json 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unknown")
        if [ "$bead_status" = "closed" ]; then
            log_success "Bead $bead_id completed successfully"
            return 0
        fi
        sleep $poll_interval
        elapsed=$((elapsed + poll_interval))
        log_info "Waiting for bead $bead_id... (${elapsed}s / ${timeout}s)"
    done

    log_warn "Timeout waiting for bead $bead_id"
    return 1
}

# ============================================================================
# Session Management & Cleanup
# ============================================================================

cleanup_sessions() {
    log_info "Cleaning up temporary ralph sessions..."
    # Clean up temporary ralph sessions
    for session in $(ntm list --json 2>/dev/null | jq -r '.[] | select(.name | startswith("ralph-")) | .name' 2>/dev/null || true); do
        log_info "Cleaning up session: $session"
        ntm kill "$session" 2>/dev/null || true
    done
}

# Trap for graceful cleanup
trap cleanup_sessions EXIT

# ============================================================================
# Main Loop
# ============================================================================

main_loop() {
    local max_iterations="$1"
    local iteration=1
    declare -a active_sessions=()

    echo ""
    echo "=============================================="
    echo " Ralph - Enhanced Bead Processor with NTM"
    echo "=============================================="
    echo ""
    log_info "Max iterations: $max_iterations"
    log_info "Concurrent limit: $CONCURRENT_LIMIT"
    log_info "Session: $SESSION_NAME"
    log_info "Timeout: ${TIMEOUT}s"
    if [ "$DRY_RUN" = true ]; then
        log_warn "DRY RUN MODE - No actual work will be performed"
    fi
    echo ""

    while [ $iteration -le $max_iterations ]; do
        echo "--- Iteration $iteration of $max_iterations ---"

        # Get ready work
        local bead_json
        bead_json=$(bd ready --limit "$CONCURRENT_LIMIT" --json 2>/dev/null || echo "[]")
        local bead_count
        bead_count=$(echo "$bead_json" | jq length 2>/dev/null || echo "0")

        if [ "$bead_count" -eq 0 ]; then
            log_success "No more ready beads. Ralph's work is done!"
            break
        fi

        log_info "Found $bead_count ready bead(s)"

        # Process each bead
        for i in $(seq 0 $((bead_count - 1))); do
            local bead_id
            local bead_title
            bead_id=$(echo "$bead_json" | jq -r ".[$i].id")
            bead_title=$(echo "$bead_json" | jq -r ".[$i].title")

            echo ""
            log_info "Processing bead $bead_id: $bead_title"

            # Distribute work
            if distribute_work "$bead_id" "$bead_title"; then
                # Determine session for monitoring
                local session_name
                if check_ntm_session "$SESSION_NAME" >/dev/null 2>&1; then
                    session_name="$SESSION_NAME"
                else
                    session_name="ralph-$bead_id"
                fi

                active_sessions+=("$session_name:$bead_id")
                log_success "Work distributed to session: $session_name"
            else
                log_error "Failed to distribute work for bead $bead_id"
            fi
        done

        # Wait for all active work to complete (unless in dry-run mode)
        if [ "$DRY_RUN" = false ]; then
            for session_info in "${active_sessions[@]:-}"; do
                if [ -n "$session_info" ]; then
                    local session_name="${session_info%:*}"
                    local bead_id="${session_info#*:}"

                    wait_for_completion "$session_name" "$bead_id" "$TIMEOUT"
                fi
            done
        fi

        # Clear active sessions for next iteration
        active_sessions=()
        iteration=$((iteration + 1))

        # Push changes to git
        if [ "$DRY_RUN" = false ]; then
            log_info "Pushing changes to origin..."
            git push origin main 2>/dev/null || log_warn "Git push failed or nothing to push"
        fi

        echo ""
        echo "======================== LOOP ========================"
        echo ""

        sleep 1
    done

    echo ""
    log_success "Ralph completed $((iteration - 1)) iteration(s)"
}

# ============================================================================
# CLI Interface
# ============================================================================

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
    $0 --dry-run 3        # Preview 3 iterations without executing

MONITORING:
    During execution, you can check progress with:
    - ntm activity hypermark --watch    # Real-time agent monitoring
    - ntm attach hypermark              # Attach to session interactively
    - ntm --robot-status               # Full session status (JSON)
    - ntm --robot-terse                # Compact status line

EOF
}

# Parse arguments
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

# Start monitoring in background if requested
if [ "$MONITOR" = true ] && command -v ntm > /dev/null 2>&1; then
    log_info "Starting background monitoring..."
    ntm activity "$SESSION_NAME" --watch &
    MONITOR_PID=$!
    trap "kill $MONITOR_PID 2>/dev/null; cleanup_sessions" EXIT
fi

# Run main loop
main_loop "$MAX_ITERATIONS"
