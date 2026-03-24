-- docker/init-test-db.sql
-- Creates the test database alongside the main database on first container init.
-- Existing volumes need `docker compose down -v` to re-trigger this script.
CREATE DATABASE cleave_test;
