import { defineConfig } from 'vite';
import { databaseViteConfig, postgresViteTarget } from './database-vite-config';

export default defineConfig((environment) => databaseViteConfig(postgresViteTarget, environment));
