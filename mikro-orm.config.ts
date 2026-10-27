import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';

import { settings } from './src/core/settings';

export default defineConfig({
	clientUrl: settings.database.url,
	entities: ['./dist/**/*.schema.js'],
	entitiesTs: ['./src/**/*.schema.ts'],
	extensions: [Migrator],
	migrations: {
		path: './migrations',
		pathTs: './migrations',
		transactional: true,
		allOrNothing: true
	},
	pool: {
		min: settings.database.poolMin,
		max: settings.database.poolMax
	},
	debug: settings.nodeEnv === 'development'
});
