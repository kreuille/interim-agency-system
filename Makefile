.PHONY: up down logs reset restart ps smoke install dev typecheck lint test format

COMPOSE := docker compose

up:
	$(COMPOSE) up -d
	@echo ""
	@echo "Services up:"
	@echo "  Postgres      : localhost:5432  (dev / dev / interim_dev)"
	@echo "  Redis         : localhost:6379"
	@echo "  MailHog SMTP  : localhost:1025  — UI http://localhost:8025"
	@echo "  Mock MP       : http://localhost:3030"
	@echo ""

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v
	$(COMPOSE) up -d

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

smoke:
	bash ./scripts/smoke-test.sh

install:
	pnpm install

dev:
	pnpm dev

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test:
	pnpm test

format:
	pnpm format
