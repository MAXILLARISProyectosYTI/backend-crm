import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { DateTimezoneInterceptor } from './interceptors/date-timezone.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Aumentar límite de payload para soportar imágenes en base64
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  
  // Configurar interceptador de fecha

  app.useGlobalInterceptors(new DateTimezoneInterceptor());

  // Configurar archivos estáticos
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  
  // Configurar ValidationPipe global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  
  // Configurar CORS si es necesario
  const corsOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : (process.env.NODE_ENV === 'production' ? [] : ['*']);
  
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  await app.listen(process.env.PORT ?? 8990);
  console.log(`🚀 Servidor ejecutándose en puerto ${process.env.PORT ?? 8990}`);
  console.log(`🔌 WebSocket disponible en ws://localhost:${process.env.PORT ?? 8990}/opportunity`);
  console.log(`🌐 Dashboard web disponible en http://localhost:${process.env.PORT ?? 8990}`);
}
bootstrap();
