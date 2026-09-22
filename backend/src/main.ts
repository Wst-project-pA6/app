import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, getConfiguredPort, setupSwagger } from './app-bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  configureApp(app);
  setupSwagger(app);

  await app.listen(getConfiguredPort(app));
}
void bootstrap();
