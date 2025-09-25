import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Configurar archivos estáticos
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  
  // Configurar ValidationPipe global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  
  // Configurar CORS si es necesario
  app.enableCors({
    origin: '*', // En producción, especificar dominios permitidos
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  await app.listen(process.env.PORT ?? 8990);
  console.log(`🚀 Servidor ejecutándose en puerto ${process.env.PORT ?? 8990}`);
  console.log(`🔌 WebSocket disponible en ws://localhost:${process.env.PORT ?? 8990}/opportunity`);
  console.log(`🌐 Dashboard web disponible en http://localhost:${process.env.PORT ?? 8990}`);
}
bootstrap();
