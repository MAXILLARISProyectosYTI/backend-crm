import { Body, Controller, Post } from "@nestjs/common"
import { SignInDto } from "./dto/sign-in.dto"
import { AuthService } from "./auth.service"


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-in')
  async signIn(@Body() body: SignInDto): Promise<any> {
    return await this.authService.signIn(body);
  }
}
