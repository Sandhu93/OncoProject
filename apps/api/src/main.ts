import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { readConfig } from './config.js';

async function main() {
  const config = readConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(config.port, config.host);
}

main().catch(() => {
  console.error('API startup failed. Check configuration and local service availability.');
  process.exitCode = 1;
});
