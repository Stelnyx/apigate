import { Controller, Get, Post, Delete, UseGuards } from "@nestjs/common";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get(":id")
  findOne() { return null; }

  @Post()
  create() { return null; }

  @Delete(":id")
  remove() { return null; }
}

@Controller("public")
export class PublicController {
  @Get("status")
  status() { return { ok: true }; }

  @Post("contact")
  contact() { return null; }
}
