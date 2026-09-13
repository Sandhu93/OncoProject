import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableShutdownHooks();
}
