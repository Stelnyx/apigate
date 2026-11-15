import { Controller, Get, Post } from "@nestjs/common";

@Controller("items")
export class ItemsController {
  @Get() list() {}
  @Public()
  @UseGuards(RolesGuard)
  @Post() create() {}
}

@SkipAuth()
@Controller("open")
export class OpenController {
  @Get("info") info() {}
}

@Controller("status")
export class StatusController {
  @Get() status() {}
}

@Controller("ping")
export class PingController {
  @Get() ping() {}
}
@Controller("notes")
export class NotesController {
  @Get(":id") // fetch one
  @UseGuards(RolesGuard)
  findOne() {}
}
