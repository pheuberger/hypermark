# Hypermark Development Makefile
# Two modes: local (make dev) and remote (make remote)
# Stop all: make stop

SHELL := /bin/bash
.PHONY: dev remote stop clean-stale

# PID files
PID_SIGNALING := /tmp/hypermark-signaling.pid
PID_VITE := /tmp/hypermark-vite.pid
PID_NGROK := /tmp/hypermark-ngrok.pid

# Ports
PORT_SIGNALING := 4444
PORT_VITE := 5173

# Timeouts
TIMEOUT_SECS := 30

# Colors for output
GREEN := \033[0;32m
RED := \033[0;31m
YELLOW := \033[0;33m
NC := \033[0m # No Color

#------------------------------------------------------------------------------
# Helper functions
#------------------------------------------------------------------------------

define check_pid_alive
$(shell if [ -f $(1) ] && kill -0 $$(cat $(1)) 2>/dev/null; then echo "yes"; fi)
endef

define is_already_running
$(if $(call check_pid_alive,$(PID_SIGNALING))$(call check_pid_alive,$(PID_VITE)),yes,)
endef

#------------------------------------------------------------------------------
# make dev - Local development (no ngrok)
#------------------------------------------------------------------------------

dev:
	@# Check if already running
	@if [ -f "$(PID_SIGNALING)" ] && kill -0 $$(cat "$(PID_SIGNALING)") 2>/dev/null && \
	   [ -f "$(PID_VITE)" ] && kill -0 $$(cat "$(PID_VITE)") 2>/dev/null; then \
		echo -e "$(YELLOW)Already running$(NC)"; \
		exit 0; \
	fi
	@# Clean stale PID files
	@$(MAKE) --no-print-directory clean-stale
	@# Check ports are free
	@$(MAKE) --no-print-directory check-ports
	@# Setup
	@mkdir -p logs
	@: > logs/dev.log
	@# Write .env.local for local dev
	@echo "VITE_SIGNALING_URL=ws://localhost:$(PORT_SIGNALING)" > .env.local
	@echo "VITE_SUGGESTION_URL=http://localhost:$(PORT_SIGNALING)" >> .env.local
	@# Start services server (signaling + suggestions)
	@echo -e "$(GREEN)Starting services server...$(NC)"
	@npm run services 2>&1 | sed 's/^/[services] /' >> logs/dev.log & \
		echo $$! > $(PID_SIGNALING)
	@# Wait for signaling ready
	@$(MAKE) --no-print-directory wait-signaling
	@# Start Vite
	@echo -e "$(GREEN)Starting Vite dev server...$(NC)"
	@npm run dev 2>&1 | sed 's/^/[vite] /' >> logs/dev.log & \
		echo $$! > $(PID_VITE)
	@# Wait for Vite ready
	@$(MAKE) --no-print-directory wait-vite
	@echo ""
	@echo -e "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo -e "$(GREEN)  Local dev ready at http://localhost:$(PORT_VITE)$(NC)"
	@echo -e "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "  Services: http://localhost:$(PORT_SIGNALING) (signaling + suggestions)"
	@echo "  Logs:     tail -f logs/dev.log"
	@echo "  Stop:     make stop"
	@echo ""

#------------------------------------------------------------------------------
# make remote - Full ngrok setup for cross-device testing
#------------------------------------------------------------------------------

remote:
	@# Check if already running
	@if [ -f "$(PID_SIGNALING)" ] && kill -0 $$(cat "$(PID_SIGNALING)") 2>/dev/null && \
	   [ -f "$(PID_VITE)" ] && kill -0 $$(cat "$(PID_VITE)") 2>/dev/null && \
	   [ -f "$(PID_NGROK)" ] && kill -0 $$(cat "$(PID_NGROK)") 2>/dev/null; then \
		echo -e "$(YELLOW)Already running$(NC)"; \
		exit 0; \
	fi
	@# Clean stale PID files
	@$(MAKE) --no-print-directory clean-stale
	@# Check ports are free
	@$(MAKE) --no-print-directory check-ports
	@# Setup
	@mkdir -p logs
	@: > logs/dev.log
	@# Start services server (signaling + suggestions)
	@echo -e "$(GREEN)Starting services server...$(NC)"
	@npm run services 2>&1 | sed 's/^/[services] /' >> logs/dev.log & \
		echo $$! > $(PID_SIGNALING)
	@# Wait for services ready
	@$(MAKE) --no-print-directory wait-signaling
	@# Start ngrok
	@echo -e "$(GREEN)Starting ngrok tunnels...$(NC)"
	@ngrok start vite signaling 2>&1 | sed 's/^/[ngrok] /' >> logs/dev.log & \
		echo $$! > $(PID_NGROK)
	@# Wait for ngrok (simple sleep - ngrok API needs time)
	@sleep 3
	@# Discover tunnel URLs
	@$(MAKE) --no-print-directory discover-tunnels
	@# Start Vite (after .env.local is written by discover-tunnels)
	@echo -e "$(GREEN)Starting Vite dev server...$(NC)"
	@npm run dev 2>&1 | sed 's/^/[vite] /' >> logs/dev.log & \
		echo $$! > $(PID_VITE)
	@# Wait for Vite ready
	@$(MAKE) --no-print-directory wait-vite
	@# Open browser
	@VITE_URL=$$(cat /tmp/hypermark-vite-url.tmp 2>/dev/null) && \
		if [ -n "$$VITE_URL" ]; then \
			xdg-open "$$VITE_URL" 2>/dev/null || true; \
		fi
	@# Print success
	@echo ""
	@echo -e "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo -e "$(GREEN)  Remote dev ready!$(NC)"
	@echo -e "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "  Vite:      $$(cat /tmp/hypermark-vite-url.tmp 2>/dev/null)"
	@echo "  Signaling: $$(cat /tmp/hypermark-signaling-url.tmp 2>/dev/null)"
	@echo ""
	@echo "  Logs: tail -f logs/dev.log"
	@echo "  Stop: make stop"
	@echo ""
	@rm -f /tmp/hypermark-vite-url.tmp /tmp/hypermark-signaling-url.tmp

#------------------------------------------------------------------------------
# make stop - Graceful shutdown
#------------------------------------------------------------------------------

stop:
	@STOPPED=0; \
	for pidfile in $(PID_SIGNALING) $(PID_VITE) $(PID_NGROK); do \
		if [ -f "$$pidfile" ]; then \
			PID=$$(cat "$$pidfile"); \
			if kill -0 "$$PID" 2>/dev/null; then \
				kill "$$PID" 2>/dev/null || true; \
				STOPPED=1; \
			fi; \
			rm -f "$$pidfile"; \
		fi; \
	done; \
	if [ "$$STOPPED" -eq 1 ]; then \
		echo -e "$(GREEN)Stopped$(NC)"; \
	else \
		echo -e "$(YELLOW)Nothing running$(NC)"; \
	fi

#------------------------------------------------------------------------------
# Internal targets
#------------------------------------------------------------------------------

clean-stale:
	@for pidfile in $(PID_SIGNALING) $(PID_VITE) $(PID_NGROK); do \
		if [ -f "$$pidfile" ]; then \
			PID=$$(cat "$$pidfile"); \
			if ! kill -0 "$$PID" 2>/dev/null; then \
				rm -f "$$pidfile"; \
			fi; \
		fi; \
	done

check-ports:
	@for port in $(PORT_SIGNALING) $(PORT_VITE); do \
		PID=$$(lsof -ti :$$port 2>/dev/null | head -1); \
		if [ -n "$$PID" ]; then \
			echo -e "$(RED)Error: Port $$port already in use by PID $$PID (not ours) — aborting$(NC)"; \
			exit 1; \
		fi; \
	done

wait-signaling:
	@echo -n "  Waiting for services"
	@ELAPSED=0; \
	while [ $$ELAPSED -lt $(TIMEOUT_SECS) ]; do \
		if curl -s http://localhost:$(PORT_SIGNALING)/api/health 2>&1 | grep -q '"status":"ok"'; then \
			echo -e " $(GREEN)✓$(NC)"; \
			exit 0; \
		fi; \
		echo -n "."; \
		sleep 1; \
		ELAPSED=$$((ELAPSED + 1)); \
	done; \
	echo -e " $(RED)✗$(NC)"; \
	echo -e "$(RED)Error: Services server failed to start within $(TIMEOUT_SECS)s$(NC)"; \
	$(MAKE) --no-print-directory stop; \
	exit 1

wait-vite:
	@echo -n "  Waiting for Vite"
	@ELAPSED=0; \
	while [ $$ELAPSED -lt $(TIMEOUT_SECS) ]; do \
		if curl -s http://localhost:$(PORT_VITE) >/dev/null 2>&1; then \
			echo -e " $(GREEN)✓$(NC)"; \
			exit 0; \
		fi; \
		echo -n "."; \
		sleep 1; \
		ELAPSED=$$((ELAPSED + 1)); \
	done; \
	echo -e " $(RED)✗$(NC)"; \
	echo -e "$(RED)Error: Vite failed to start within $(TIMEOUT_SECS)s$(NC)"; \
	$(MAKE) --no-print-directory stop; \
	exit 1

discover-tunnels:
	@echo -n "  Discovering ngrok tunnels"
	@TUNNELS=$$(curl -s http://localhost:4040/api/tunnels 2>/dev/null); \
	if [ -z "$$TUNNELS" ] || [ "$$TUNNELS" = "null" ]; then \
		echo -e " $(RED)✗$(NC)"; \
		echo -e "$(RED)Error: Failed to discover ngrok tunnel URLs$(NC)"; \
		$(MAKE) --no-print-directory stop; \
		exit 1; \
	fi; \
	SIGNALING_URL=$$(echo "$$TUNNELS" | jq -r '.tunnels[] | select(.config.addr | contains("4444")) | .public_url' | head -1); \
	VITE_URL=$$(echo "$$TUNNELS" | jq -r '.tunnels[] | select(.config.addr | contains("5173")) | .public_url' | head -1); \
	if [ -z "$$SIGNALING_URL" ] || [ -z "$$VITE_URL" ]; then \
		echo -e " $(RED)✗$(NC)"; \
		echo -e "$(RED)Error: Could not find expected tunnels (vite/signaling)$(NC)"; \
		$(MAKE) --no-print-directory stop; \
		exit 1; \
	fi; \
	WS_URL=$$(echo "$$SIGNALING_URL" | sed 's|^https://|wss://|'); \
	echo "VITE_SIGNALING_URL=$$WS_URL" > .env.local; \
	echo "VITE_SUGGESTION_URL=$$SIGNALING_URL" >> .env.local; \
	echo "$$VITE_URL" > /tmp/hypermark-vite-url.tmp; \
	echo "$$SIGNALING_URL" > /tmp/hypermark-signaling-url.tmp; \
	echo -e " $(GREEN)✓$(NC)"
