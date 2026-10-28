import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import config from '../../../mikro-orm.config';
import { settings } from '../settings';

@Module({
	imports: [
		MikroOrmModule.forRootAsync({
			useFactory: () => ({
				...config,
				clientUrl: settings.database.url
			})
		})
	]
})
export class DatabaseModule {}
