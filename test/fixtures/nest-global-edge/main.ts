import { NestFactory } from "@nestjs/core";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new JwtAuthGuard(reflector));
  app.setGlobalPrefix("/v1/", { exclude: ["status", { path: "ping", method: RequestMethod.GET }] });
}
bootstrap();
