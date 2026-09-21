import { defineConfig } from 'vite';
import { databaseViteConfig, sqliteViteTarget } from './database-vite-config';

export default defineConfig((environment) => databaseViteConfig(sqliteViteTarget, environment));
