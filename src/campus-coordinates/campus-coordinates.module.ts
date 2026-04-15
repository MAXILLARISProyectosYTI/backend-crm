import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampusCoordinates } from './campus-coordinates.entity';
import { CampusCoordinatesService } from './campus-coordinates.service';

@Module({
  imports: [TypeOrmModule.forFeature([CampusCoordinates])],
  providers: [CampusCoordinatesService],
  exports: [CampusCoordinatesService],
})
export class CampusCoordinatesModule {}
