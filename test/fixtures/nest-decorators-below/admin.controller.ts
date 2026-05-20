import { Controller, Get, Post, UseGuards, Body, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "./roles.decorator";

// Class-level UseGuards BELOW @Controller — this case already worked in v0.2.
@Controller("admin")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  // Decorators BELOW the @Get anchor — these were silently dropped in v0.2
  // and fixed in v0.3 (bidirectional decorator scan).
  @Get("/me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  findMe() { return null; }

  // Existing canonical placement: guards ABOVE @Get. Must still work.
  @UseGuards(AdminGuard)
  @Get("/super")
  findSuper() { return null; }

  // Mixed: guards on both sides of @Post. All must be captured.
  @Roles("admin")
  @Post("/audit")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Write audit event" })
  writeAudit(@Body() body: any) { return null; }

  // @ApiResponse between @Get and the method body (decoration noise).
  @Get("/health")
  @ApiResponse({ status: 200 })
  health() { return { ok: true }; }
}
