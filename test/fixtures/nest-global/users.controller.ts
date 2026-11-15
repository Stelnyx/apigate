import { Controller, Get, Post } from "@nestjs/common";
import { Public } from "./public.decorator";

@Controller("users")
export class UsersController {
  @Get() list() {}
  @Post() create() {}
  @Public() @Get("health") health() {}
}
