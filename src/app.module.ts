import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OpportunityModule } from './opportunity/opportunity.module';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import databaseConfig from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { ContactModule } from './contact/contact.module';
import { MeetingModule } from './meeting/meeting.module';
import { CommonModule } from './common/common.module';
import { ActionHistoryModule } from './action-history/action-history.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const config = configService.get('database');
        if (!config) {
          throw new Error('Database configuration not found');
        }
        return config;
      },
      inject: [ConfigService],
    }),
    CommonModule,
    OpportunityModule,
    UserModule,
    RoleModule,
    AuthModule,
    ContactModule,
    MeetingModule,
    ActionHistoryModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
