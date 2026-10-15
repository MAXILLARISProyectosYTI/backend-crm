import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ContractGerenciaPolicyService } from './contract-gerencia-policy.service';
import { ConfirmGerenciaBandDto } from './dto/confirm-gerencia-band.dto';

@Controller('contract-gerencia-policy')
@UseGuards(JwtAuthGuard)
export class ContractGerenciaPolicyController {
  constructor(private readonly service: ContractGerenciaPolicyService) {}

  @Get('usage')
  async usage(@Req() req: { user?: { userId: string } }) {
    const userId = req.user?.userId;
    if (!userId) {
      return { usesThisMonth: 0, monthlyLimit: 5, usesRemaining: 5 };
    }
    return this.service.getUsageSummary(userId);
  }

  @Post('confirm')
  async confirm(
    @Req() req: { user?: { userId: string } },
    @Body() dto: ConfirmGerenciaBandDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.service.confirmBandOverride(userId, dto);
  }
}
