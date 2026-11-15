import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { UsersController } from "./users.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({ controllers: [UsersController], providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }] })
export class AppModule {}
