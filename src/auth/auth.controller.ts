import { Body, Controller, Get, Param, Post } from "@nestjs/common"
import { SignInDto } from "./dto/sign-in.dto"
import { RefreshTokenDto } from "./dto/refresh-token.dto"
import { AuthService } from "./auth.service"


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-in')
  async signIn(@Body() body: SignInDto): Promise<any> {
    return await this.authService.signIn(body);
  }

  @Post('refresh-token')
  async refreshToken(@Body() body: RefreshTokenDto): Promise<any> {
    return await this.authService.refreshToken(body);
  }

  @Get('by-user/:id')
  async byUser(@Param('id') id: string): Promise<any> {
    return await this.authService.byUserId(id);
  }
}
