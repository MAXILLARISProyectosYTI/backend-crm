import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>, 
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  async signIn(body: SignInDto): Promise<any> {
    const { userName, password } = body;
    const user = await this.userService.findByUserName(userName);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, userName: user.userName };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '5m'),
      }
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: user,
    };
  }

  async refreshToken(body: RefreshTokenDto): Promise<any> {
    try {
      const { refreshToken } = body;
      
      // Verificar el refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Verificar que sea un refresh token válido
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token inválido');
      }

      // Buscar el usuario
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // Generar nuevos tokens
      const newPayload = { sub: user.id, userName: user.userName };
      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(
        { sub: user.id, type: 'refresh' },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '5m'),
        }
      );

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        user: user,
      };
    } catch (error) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  async byUserId(id: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: id },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const payload = { sub: user.id, userName: user.userName };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '5m'),
      }
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: user,
    };
  }

  async signInWithApiKey(apiKey: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { apiKey: apiKey },
    });
  
    if (!user) {
      throw new UnauthorizedException('API Key inválida');
    }
  
    // Construimos el payload del JWT
    const payload = { sub: user.id, userName: user.userName, type: 'api' };
  
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '5m'),
      }
    );
  
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        userName: user.userName,
        type: 'api',
      },
    };
  }
  
}
