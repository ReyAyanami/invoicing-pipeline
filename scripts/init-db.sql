-- Initial database setup for invoicing pipeline
-- This runs automatically when PostgreSQL container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schema
CREATE SCHEMA IF NOT EXISTS billing;

-- Set search path
ALTER DATABASE billing_db SET search_path TO billing, public;

-- Placeholder for future migrations
-- Migrations will be managed by TypeORM

