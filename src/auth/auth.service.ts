import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { SignInDto } from './dto/sign-in.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>, 
    private readonly jwtService: JwtService,
  ) {}

  async signIn(body: SignInDto): Promise<any> {
    const { userName, password } = body;
    const user = await this.userRepository.findOne({
      where: { userName: userName },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }


    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, userName: user.userName };

    return {
      access_token: this.jwtService.sign(payload),
      user: user,
    };

  }


}
