import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

// { provide: APP_GUARD, useClass: CommentedGuard }
/* { provide: APP_GUARD, useClass: BlockCommentedGuard } */
@Module({
  controllers: [ItemsController, OpenController],
  providers: [{ useExisting: OrgGuard, provide: APP_GUARD }]
})
export class AppModule {}
