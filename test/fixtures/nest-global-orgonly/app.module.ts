@Module({ controllers: [AccountsController], providers: [{ provide: APP_GUARD, useClass: OrgGuard }] })
export class AppModule {}
